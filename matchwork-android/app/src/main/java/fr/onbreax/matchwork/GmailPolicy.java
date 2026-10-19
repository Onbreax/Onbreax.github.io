package fr.onbreax.matchwork;

import java.net.URLDecoder;
import java.util.*;

/** Exact read-only Gmail paths. Tokens cannot be forwarded to arbitrary hosts. */
final class GmailPolicy {
 static boolean email(String value) { return value != null && value.length() <= 254 && value.matches("[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\\.[a-zA-Z0-9-]+)+"); }
 static boolean password(String value) { return value != null && value.matches("[a-zA-Z0-9]{16}"); }
 static boolean profileId(String value) { return value != null && value.matches("p[a-zA-Z0-9_-]{1,100}"); }
 static boolean path(String path) {
  if (path == null || path.length() > 6000 || path.indexOf('#') >= 0 || path.indexOf('\r') >= 0 || path.indexOf('\n') >= 0) return false;
  if (path.equals("profile") || path.matches("messages/[a-zA-Z0-9_-]{1,200}\\?format=full")) return true;
  if (!path.startsWith("messages?")) return false;
  try {
   Map<String,String> params = new HashMap<>();
   for (String part : path.substring(9).split("&")) {
    String[] pair = part.split("=", 2);
    if (pair.length != 2) return false;
    String key = URLDecoder.decode(pair[0], "UTF-8"), value = URLDecoder.decode(pair[1], "UTF-8");
    if (params.put(key, value) != null) return false;
   }
   if (!params.keySet().equals(new HashSet<>(Arrays.asList("q", "maxResults", "fields")))
       && !params.keySet().equals(new HashSet<>(Arrays.asList("q", "maxResults", "fields", "pageToken")))) return false;
   return "100".equals(params.get("maxResults")) && "messages(id),nextPageToken".equals(params.get("fields"))
    && params.get("q").matches("from:jobalerts-noreply@linkedin\\.com after:[0-9]{9,12} before:[0-9]{9,12} -in:spam -in:trash")
    && (!params.containsKey("pageToken") || params.get("pageToken").matches("[a-zA-Z0-9_+\\-/=]{1,2000}"));
  } catch (Exception error) { return false; }
 }
}
