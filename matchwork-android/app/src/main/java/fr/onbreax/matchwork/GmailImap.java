package fr.onbreax.matchwork;

import javax.net.ssl.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.*;

/** Small Gmail-only, read-only IMAP client. No arbitrary servers or commands. */
final class GmailImap implements Closeable {
 static final int MAX_MAIL = 2 * 1024 * 1024;
 private Socket socket;
 private InputStream input;
 private OutputStream output;
 private int sequence;
 String validity;
 private String cachedQuery;
 private List<String> cachedIds;
 static final class Reply {
  final List<String> lines = new ArrayList<>();
  final List<byte[]> literals = new ArrayList<>();
 }
 GmailImap(String email, String password) throws IOException {
  try {
   Socket tcp = new Socket(); socket = tcp;
   tcp.connect(new InetSocketAddress("imap.gmail.com", 993), 15000);
   tcp.setSoTimeout(25000);
   SSLSocket tls = (SSLSocket)((SSLSocketFactory)SSLSocketFactory.getDefault()).createSocket(tcp,"imap.gmail.com",993,true);
   socket = tls;
   SSLParameters params=tls.getSSLParameters();params.setEndpointIdentificationAlgorithm("HTTPS");tls.setSSLParameters(params);
   tls.setSoTimeout(25000);tls.startHandshake();input=tls.getInputStream();output=tls.getOutputStream();
   if(!line().startsWith("* OK"))throw new IOException("Gmail IMAP indisponible.");
   try { command("LOGIN "+quote(email)+" "+quote(password)); }
   catch(IOException error) { throw new IOException("Connexion Gmail refusée. Vérifie le mot de passe d’application à 16 caractères et la validation en deux étapes."); }
   Reply folders=command("LIST \"\" \"*\"");String all=null;
   for(int i=0;i<folders.lines.size();i++) {
    String value=folders.lines.get(i);
    if(!value.toLowerCase(Locale.ROOT).contains("\\all"))continue;
    Matcher m=Pattern.compile("\"((?:[^\"\\\\]|\\\\.)*)\"\\s*$").matcher(value);
    if(m.find())all=m.group(1).replace("\\\"","\"").replace("\\\\","\\");
    else if(value.matches(".*\\{[0-9]+\\}$")&&!folders.literals.isEmpty())all=new String(folders.literals.get(0),StandardCharsets.US_ASCII);
   }
   if(all==null)throw new IOException("Le dossier Gmail Tous les messages est inaccessible. Vérifie son accès IMAP dans Gmail.");
   Reply selected=command("EXAMINE "+quote(all));
   for(String value:selected.lines){Matcher m=Pattern.compile("\\[UIDVALIDITY ([0-9]+)\\]",Pattern.CASE_INSENSITIVE).matcher(value);if(m.find())validity=m.group(1);}
   if(validity==null)throw new IOException("Réponse Gmail IMAP incomplète.");
  } catch(IOException|RuntimeException error){close();throw error;}
 }
 // Deterministic protocol tests use byte streams, never real credentials.
 GmailImap(InputStream input, OutputStream output){this.input=input;this.output=output;}
 static String quote(String value) throws IOException {
  if(value==null||value.indexOf('\r')>=0||value.indexOf('\n')>=0||value.indexOf('\0')>=0)throw new IOException("Valeur IMAP invalide.");
  return "\""+value.replace("\\","\\\\").replace("\"","\\\"")+"\"";
 }
 private String line() throws IOException {
  ByteArrayOutputStream bytes=new ByteArrayOutputStream();int value;
  while((value=input.read())!=-1){if(value==10)break;if(bytes.size()>=1024*1024)throw new IOException("Réponse Gmail IMAP trop longue.");bytes.write(value);}
  if(value==-1)throw new EOFException("Connexion Gmail interrompue. Relance la connexion.");
  String line=new String(bytes.toByteArray(),StandardCharsets.UTF_8);return line.endsWith("\r")?line.substring(0,line.length()-1):line;
 }
 Reply command(String command) throws IOException {
  String tag=String.format(Locale.ROOT,"M%05d",++sequence);
  output.write((tag+" "+command+"\r\n").getBytes(StandardCharsets.UTF_8));output.flush();
  Reply reply=new Reply();int total=0;
  while(true){
   String value=line();total+=value.length();if(total>8*1024*1024)throw new IOException("Réponse Gmail IMAP trop volumineuse.");reply.lines.add(value);
   Matcher literal=Pattern.compile("\\{([0-9]+)\\}$").matcher(value);
   if(literal.find()){
    long size=Long.parseLong(literal.group(1));if(size>MAX_MAIL+1||size<0)throw new IOException("Email Gmail supérieur à 2 Mo ; récupération interrompue.");
    total+=(int)size;if(total>8*1024*1024)throw new IOException("Réponse Gmail trop volumineuse.");
    byte[] data=new byte[(int)size];int at=0,n;while(at<data.length){n=input.read(data,at,data.length-at);if(n<0)throw new EOFException("Email Gmail incomplet.");at+=n;}reply.literals.add(data);
   }
   if(value.startsWith("* BYE"))throw new IOException("Connexion Gmail interrompue. Relance la connexion.");
   if(value.startsWith(tag+" ")){if(!value.startsWith(tag+" OK"))throw new IOException("Gmail a refusé la lecture IMAP.");return reply;}
  }
 }
 List<String> search(String query) throws IOException {
  if(query.equals(cachedQuery)&&cachedIds!=null)return cachedIds;
  Reply reply=command("UID SEARCH X-GM-RAW "+quote(query));List<String> ids=new ArrayList<>();
  for(String value:reply.lines)if(value.startsWith("* SEARCH"))for(String id:value.substring(8).trim().split(" +"))if(id.matches("[0-9]{1,15}"))ids.add(id);
  ids.sort((a,b)->Long.compare(Long.parseLong(b),Long.parseLong(a)));cachedQuery=query;cachedIds=ids;return ids;
 }
 byte[] message(String id) throws IOException {
  if(!id.matches("[0-9]{1,15}"))throw new IOException("Identifiant Gmail invalide.");
  if(cachedIds==null||!cachedIds.contains(id))throw new IOException("Identifiant Gmail absent des alertes recherchées.");
  Reply reply=command("UID FETCH "+id+" (UID RFC822.SIZE BODY.PEEK[]<0."+(MAX_MAIL+1)+">)");
  for(String value:reply.lines){Matcher m=Pattern.compile("RFC822.SIZE ([0-9]+)").matcher(value);if(m.find()&&Long.parseLong(m.group(1))>MAX_MAIL)throw new IOException("Email Gmail supérieur à 2 Mo ; récupération interrompue.");}
  if(reply.literals.size()!=1||reply.literals.get(0).length>MAX_MAIL)throw new IOException("Email Gmail absent ou trop volumineux.");
  return reply.literals.get(0);
 }
 public void close(){try{if(socket!=null)socket.close();}catch(IOException ignored){}}
}
