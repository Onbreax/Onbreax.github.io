package fr.onbreax.matchwork;
import java.nio.charset.*;
import java.util.*;
import java.util.regex.*;

/** Bounded MIME decoding; attachments and embedded messages are not imported. */
final class GmailMime {
 static final class Body { final String type,content; Body(String t,String c){type=t;content=c;} }
 final Map<String,String> headers=new LinkedHashMap<>();
 final List<Body> bodies=new ArrayList<>();
 GmailMime(byte[] raw){parse(new String(raw,StandardCharsets.ISO_8859_1),0,true);}
 static String parameter(String header,String name){
  Matcher m=Pattern.compile("(?:^|;)\\s*"+name+"\\s*=\\s*(?:\"([^\"]*)\"|([^;\\s]+))",Pattern.CASE_INSENSITIVE).matcher(header);
  return m.find()?(m.group(1)!=null?m.group(1):m.group(2)):"";
 }
 private void parse(String raw,int depth,boolean top){
  if(depth>12||bodies.size()>=32)return;
  int at=raw.indexOf("\r\n\r\n"),gap=4;if(at<0){at=raw.indexOf("\n\n");gap=2;}if(at<0||at>65536)return;
  Map<String,String> h=new LinkedHashMap<>();
  String unfolded=raw.substring(0,at).replaceAll("\\r?\\n[ \\t]+"," ");
  for(String line:unfolded.split("\\r?\\n")){int colon=line.indexOf(':');if(colon>0)h.put(line.substring(0,colon).trim().toLowerCase(Locale.ROOT),line.substring(colon+1).trim());}
  if(top)headers.putAll(h);
  String contentType=h.getOrDefault("content-type","text/plain"),type=contentType.split(";",2)[0].trim().toLowerCase(Locale.ROOT),disposition=h.getOrDefault("content-disposition","");
  if(disposition.toLowerCase(Locale.ROOT).startsWith("attachment")||!parameter(disposition,"filename").isEmpty()||!parameter(contentType,"name").isEmpty())return;
  String body=raw.substring(at+gap);
  if(type.startsWith("multipart/")){
   String boundary=parameter(contentType,"boundary");if(boundary.isEmpty()||boundary.length()>200)return;
   Matcher delimiters=Pattern.compile("(?m)^--"+Pattern.quote(boundary)+"(--)?[ \\t]*\\r?$").matcher(body);int start=-1;
   while(delimiters.find()){
    if(start>=0){String part=body.substring(start,delimiters.start());part=part.replaceFirst("\\r?\\n$","");parse(part,depth+1,false);}
    if(delimiters.group(1)!=null)break;
    start=delimiters.end();if(start<body.length()&&body.charAt(start)=='\n')start++;
   }
   return;
  }
  if(!type.equals("text/plain")&&!type.equals("text/html"))return;
  try {
   byte[] data=body.getBytes(StandardCharsets.ISO_8859_1);String encoding=h.getOrDefault("content-transfer-encoding","").toLowerCase(Locale.ROOT);
   if(encoding.equals("base64"))data=Base64.getMimeDecoder().decode(data);
   else if(encoding.equals("quoted-printable")){
    java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();
    for(int i=0;i<data.length;i++){int v=data[i]&255;if(v==61){if(i+1<data.length&&data[i+1]==10){i++;continue;}if(i+2<data.length&&data[i+1]==13&&data[i+2]==10){i+=2;continue;}if(i+2<data.length){int a=Character.digit((char)data[i+1],16),b=Character.digit((char)data[i+2],16);if(a>=0&&b>=0){out.write(a*16+b);i+=2;continue;}}}out.write(v);}data=out.toByteArray();
   }
   String charset=parameter(contentType,"charset");Charset cs;try{cs=Charset.forName(charset.isEmpty()?"UTF-8":charset);}catch(Exception e){cs=StandardCharsets.UTF_8;}
   String text=new String(data,cs);bodies.add(new Body(type,text.substring(0,Math.min(1000000,text.length()))));
  }catch(IllegalArgumentException ignored){}
 }
}
