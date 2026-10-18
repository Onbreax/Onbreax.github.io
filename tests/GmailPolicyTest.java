package fr.onbreax.matchwork;
import java.net.URLEncoder;
public final class GmailPolicyTest {
 private static void check(boolean condition) { if(!condition)throw new AssertionError(); }
 public static void main(String[] args) throws Exception {
  check(GmailPolicy.profileId("p1"));check(!GmailPolicy.profileId("../p1"));
  check(GmailPolicy.path("profile"));check(GmailPolicy.path("messages/abc123?format=full"));
  String q="from:jobalerts-noreply@linkedin.com after:1790000000 before:1792314000 -in:spam -in:trash";
  String list="messages?q="+URLEncoder.encode(q,"UTF-8")+"&maxResults=100&fields=messages%28id%29%2CnextPageToken";
  check(GmailPolicy.path(list));check(GmailPolicy.path(list+"&pageToken=AA%2BBB%3D"));
  for(String path:new String[]{"https://evil.org/profile","../profile","messages/send","messages/a/attachments/b","messages/a?format=raw","messages/a?format=full&x=y",list+"&q=from%3Aother%40example.org",list.replace("jobalerts-noreply%40linkedin.com","other%40example.org"),list+"&userId=other",list+"#fragment","profile\n"})check(!GmailPolicy.path(path));
  System.out.println("Native Gmail policy: exact GET resources, sender query, no other mailboxes, no attachments/writes, no arbitrary URLs passed.");
 }
}
