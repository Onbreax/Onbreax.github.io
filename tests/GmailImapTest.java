package fr.onbreax.matchwork;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
public final class GmailImapTest {
 static void check(boolean b){if(!b)throw new AssertionError();}
 public static void main(String[] args)throws Exception{
  String raw="From: LinkedIn <jobalerts-noreply@linkedin.com>\r\nContent-Type: multipart/mixed; boundary=outer\r\n\r\n--outer\r\nContent-Type: multipart/alternative; boundary=inner\r\n\r\n--inner\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nResponsable conformit=C3=A9\r\nBanque Exemple\r\nParis\r\n--inner\r\nContent-Type: text/html; charset=ISO-8859-1\r\nContent-Transfer-Encoding: base64\r\n\r\nPGI+Q29uZm9ybWl06TwvYj4=\r\n--inner--\r\n--outer\r\nContent-Type: text/plain; name=attachment.txt\r\nContent-Disposition: attachment; filename=attachment.txt\r\n\r\nDO NOT IMPORT\r\n--outer--\r\n";
  GmailMime mime=new GmailMime(raw.getBytes(StandardCharsets.ISO_8859_1));check(mime.bodies.size()==2);check(mime.bodies.get(0).content.contains("conformité"));check(mime.bodies.get(1).content.contains("Conformité"));
  check(!mime.bodies.get(0).content.contains("DO NOT IMPORT"));check(mime.headers.get("from").contains("jobalerts-noreply@linkedin.com"));
  String wire="* SEARCH 9 2 12\r\nM00001 OK search\r\n* 1 FETCH (UID 12 RFC822.SIZE "+raw.length()+" BODY[] {"+raw.length()+"}\r\n"+raw+")\r\nM00002 OK fetch\r\n";
  ByteArrayOutputStream out=new ByteArrayOutputStream();GmailImap client=new GmailImap(new ByteArrayInputStream(wire.getBytes(StandardCharsets.ISO_8859_1)),out);
  check(client.search("from:example").equals(Arrays.asList("12","9","2")));check(Arrays.equals(client.message("12"),raw.getBytes(StandardCharsets.ISO_8859_1)));
  String commands=out.toString("UTF-8");check(commands.contains("UID SEARCH X-GM-RAW"));check(commands.contains("BODY.PEEK[]"));check(!commands.contains("STORE"));
  try{GmailImap.quote("x\r\nDELETE x");throw new AssertionError();}catch(IOException expected){}
  try{client.message("1 STORE");throw new AssertionError();}catch(IOException expected){}
  try{new GmailImap(new ByteArrayInputStream("* 1 FETCH (BODY[] {9999999}\r\n".getBytes(StandardCharsets.US_ASCII)),new ByteArrayOutputStream()).command("NOOP");throw new AssertionError();}catch(IOException expected){}
  System.out.println("IMAP literal framing, UID order, partial read limit, PEEK, injection rejection, nested MIME, charsets and attachment exclusion passed.");
 }
}
