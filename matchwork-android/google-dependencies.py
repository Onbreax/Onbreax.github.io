#!/usr/bin/env python3
"""Resolve pinned official Maven dependencies for the SDK-only build path.

Gradle users use app/build.gradle. This path also merges the AAR resources and
manifest entries; shipping classes alone would break Play services at runtime.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib, json, re, shutil, subprocess, sys, urllib.request, zipfile
import xml.etree.ElementTree as ET

HERE=Path(__file__).resolve().parent
CACHE=HERE/'build/google'; CACHE.mkdir(parents=True,exist_ok=True)
LOCK=HERE/'google-dependencies.lock.json'
NS={'m':'http://maven.apache.org/POM/4.0.0'}
ANDROID='http://schemas.android.com/apk/res/android'; A='{'+ANDROID+'}'
ET.register_namespace('android',ANDROID)

def download(url,path):
    if path.exists(): return path.read_bytes()
    with urllib.request.urlopen(url,timeout=45) as response: data=response.read()
    path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
    return data

def repository(group):
    return 'https://dl.google.com/dl/android/maven2/' if group.startswith(('com.google.android.','androidx.')) else 'https://repo.maven.apache.org/maven2/'

def coordinate_path(group,artifact,version,ext):
    return f'{group.replace(".","/")}/{artifact}/{version}/{artifact}-{version}.{ext}'

def pom(coordinate):
    group,artifact,version=coordinate
    data=download(repository(group)+coordinate_path(*coordinate,'pom'),CACHE/f'{group}.{artifact}-{version}.pom')
    root=ET.fromstring(data)
    def value(node,name,default=''): return node.findtext('m:'+name,default,namespaces=NS)
    packaging=value(root,'packaging','jar')
    properties={k.tag.split('}')[-1]:k.text for k in root.findall('m:properties/*',NS)}
    properties.update({'project.version':version,'project.groupId':group,'pom.version':version})
    dependencies=[]
    for node in root.findall('m:dependencies/m:dependency',NS):
        if value(node,'scope','compile') not in ('compile','runtime') or value(node,'optional')=='true':continue
        d=[value(node,k) for k in ('groupId','artifactId','version')]
        for i,s in enumerate(d):
            for key,v in properties.items():s=s.replace('${'+key+'}',v or '')
            d[i]=s.strip('[]')
        # JVM variants are the runtime artifacts of these multiplatform modules.
        if d[0]=='org.jetbrains.kotlinx' and d[1]=='kotlinx-coroutines-core':d[1]+='-jvm'
        if not re.fullmatch(r'[0-9][\w.\-]*',d[2]):raise ValueError('Unresolved dependency version: '+repr(d))
        dependencies.append(tuple(d))
    return {'group':group,'artifact':artifact,'version':version,'packaging':packaging,'dependencies':dependencies}

def version_key(v):return tuple(int(s) if s.isdigit() else s for s in re.split(r'[.\-]',v))

def resolve():
    chosen={('com.google.android.gms','play-services-auth'):'21.6.0'};known={}
    while True:
        pending=[(g,a,v) for (g,a),v in chosen.items() if (g,a,v) not in known]
        if not pending:break
        with ThreadPoolExecutor(max_workers=8) as pool:
            for coordinate,item in zip(pending,pool.map(pom,pending)):known[coordinate]=item
        for coordinate in pending:
            for g,a,v in known[coordinate]['dependencies']:
                if (g,a) not in chosen or version_key(v)>version_key(chosen[g,a]):chosen[g,a]=v
    return [known[g,a,v] for (g,a),v in sorted(chosen.items())]

def artifacts():
    locked=LOCK.exists()
    items=json.loads(LOCK.read_text())['artifacts'] if locked else resolve()
    def get(item):
        ext=item['packaging'];g,a,v=(item[k] for k in ('group','artifact','version'))
        if ext=='pom':return None
        if ext not in ('jar','aar'):raise ValueError('Unsupported packaging '+ext)
        path=CACHE/f'{g}.{a}-{v}.{ext}';data=download(repository(g)+coordinate_path(g,a,v,ext),path)
        digest=hashlib.sha256(data).hexdigest()
        if locked and item.get('sha256')!=digest:raise ValueError('Maven checksum mismatch: '+path.name)
        return {**{k:item[k] for k in ('group','artifact','version','packaging')},'sha256':digest,'path':str(path)}
    with ThreadPoolExecutor(max_workers=8) as pool:result=[x for x in pool.map(get,items) if x]
    if not locked:LOCK.write_text(json.dumps({'sdk':'Google Identity Services / play-services-auth 21.6.0','artifacts':[{k:v for k,v in i.items() if k!='path'} for i in result]},indent=2)+'\n')
    return result

def prepare(items,aapt2):
    manifest=ET.parse(HERE/'build/AndroidManifest.xml');root=manifest.getroot();app=root.find('application')
    jars=[];resources=[];packages=[]
    def merge(parent,element):
        name=element.get(A+'name');match=next((x for x in parent if x.tag==element.tag and name and x.get(A+'name')==name),None)
        if match is None:parent.append(element)
        else:
            for child in element:merge(match,child)
    for item in items:
        path=Path(item['path'])
        if item['packaging']=='jar':jars.append(str(path));continue
        directory=CACHE/path.stem;directory.mkdir(exist_ok=True)
        with zipfile.ZipFile(path) as archive:
            for name in archive.namelist():
                if name in ('classes.jar','AndroidManifest.xml') or name.startswith(('res/','libs/')):
                    if name.endswith('/'):continue
                    target=directory/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.read(name))
        if (directory/'classes.jar').exists():jars.append(str(directory/'classes.jar'))
        jars.extend(str(p) for p in sorted((directory/'libs').glob('*.jar')))
        lib=ET.fromstring((directory/'AndroidManifest.xml').read_text().replace('${applicationId}','fr.onbreax.matchwork'))
        package=lib.get('package')
        if package:packages.append(package)
        for element in lib:
            if element.tag=='application':
                for child in list(element):merge(app,child)
            elif element.tag!='uses-sdk':merge(root,element)
        if (directory/'res').exists():
            dest=directory/'resources.zip';subprocess.run([aapt2,'compile','--dir',str(directory/'res'),'-o',str(dest)],check=True);resources.append(str(dest))
    manifest.write(HERE/'build/AndroidManifest.xml',encoding='utf-8')
    config={'jars':jars,'resources':resources,'packages':sorted(set(packages))}
    (HERE/'build/google-build.json').write_text(json.dumps(config,indent=2))
    print(f'Official Google SDK ready: {len(items)} pinned artifacts, {len(resources)} resource archives.')

if __name__=='__main__':
    items=artifacts()
    if len(sys.argv)>1:prepare(items,sys.argv[1])
    else:print(f'{len(items)} Maven artifacts downloaded and pinned.')
