"""Replace web assets/version in the previously signed APK; emit an UNSIGNED APK.

Usage: python3 lottery-metrics-android/repack.py BASE.apk UNSIGNED.apk
The Android shell must be unchanged. Run prepare.py first. Align and sign the
output with the original private key, outside the repository.
"""
from pathlib import Path
import hashlib, re, struct, sys, zipfile

root=Path(__file__).resolve().parent
base,out=map(Path,sys.argv[1:3])
config=(root/'app/build.gradle').read_text()
version=re.search(r"versionName '([^']+)'",config)[1]
code=int(re.search(r'versionCode (\d+)',config)[1])
assets=root/'app/src/main/assets'
assert (assets/'index.html').is_file(), 'Run prepare.py first'

def version_manifest(data):
    data=bytearray(data); offset=8; strings=[]; replaced_code=replaced_name=False
    while offset<len(data):
        kind,header,size=struct.unpack_from('<HHI',data,offset)
        assert size>=header and offset+size<=len(data), 'Invalid binary XML'
        if kind==1:
            count,_,flags,start,_=struct.unpack_from('<IIIII',data,offset+8)
            assert not flags&0x100, 'This release expects the original UTF-16 manifest'
            for i in range(count):
                pos=offset+start+struct.unpack_from('<I',data,offset+header+4*i)[0]
                n=struct.unpack_from('<H',data,pos)[0];assert n<0x8000
                text=bytes(data[pos+2:pos+2+2*n]).decode('utf-16le');strings.append((text,pos,n))
        elif kind==0x102:
            name=struct.unpack_from('<I',data,offset+20)[0]
            if strings[name][0]=='manifest':
                attr_start,attr_size,attr_count=struct.unpack_from('<HHH',data,offset+24)
                for i in range(attr_count):
                    pos=offset+16+attr_start+i*attr_size
                    idx=struct.unpack_from('<I',data,pos+4)[0]
                    name=strings[idx][0]
                    if name=='versionCode':
                        old=struct.unpack_from('<I',data,pos+16)[0];assert old<code
                        struct.pack_into('<I',data,pos+16,code);replaced_code=True
                    elif name=='versionName':
                        idx=struct.unpack_from('<I',data,pos+16)[0]
                        old,start,n=strings[idx]
                        encoded=version.encode('utf-16le');assert len(encoded)==2*n, 'Version string length changed; use a full Android rebuild'
                        data[start+2:start+2+2*n]=encoded;replaced_name=True
        offset+=size
    assert replaced_code and replaced_name
    return bytes(data)

out.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(base) as src,zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED) as dst:
    for info in src.infolist():
        name=info.filename
        if name.startswith('META-INF/') and (name.endswith(('.RSA','.DSA','.EC','.SF')) or name=='META-INF/MANIFEST.MF'):continue
        if name.startswith('assets/'):continue
        data=src.read(name)
        if name=='AndroidManifest.xml':data=version_manifest(data)
        dst.writestr(info,data)
    for file in sorted(assets.rglob('*')):
        if file.is_file():dst.write(file,'assets/'+file.relative_to(assets).as_posix())
with zipfile.ZipFile(base) as src,zipfile.ZipFile(out) as dst:
    for name in dst.namelist():
        if name!='AndroidManifest.xml' and not name.startswith('assets/'):
            assert src.read(name)==dst.read(name), 'Unexpected shell change: '+name
    assert dst.read('assets/index.html')==(assets/'index.html').read_bytes()
print('Unsigned APK ready:',out.name,'version',version,'code',code)
print('SHA-256:',hashlib.sha256(out.read_bytes()).hexdigest())
