package fr.onbreax.mesdepenses;

import java.net.URI;

/** Network access is restricted to the account-information workflow. */
final class BankPolicy {
 static boolean allowed(URI uri, String method) {
  if (!"https".equals(uri.getScheme()) || !"api.enablebanking.com".equals(uri.getHost())
   || uri.getUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443) || uri.getFragment() != null) return false;
  String path = uri.getRawPath();
  if (path == null || path.contains("%") || path.contains("..")) return false;
  if ("POST".equals(method)) return ("/auth".equals(path) || "/sessions".equals(path)) && uri.getRawQuery() == null;
  if (!"GET".equals(method)) return false;
  return "/application".equals(path) || "/aspsps".equals(path)
   || path.matches("/sessions/[a-zA-Z0-9_-]{1,150}")
   || path.matches("/accounts/[a-zA-Z0-9_-]{1,150}/(balances|transactions)");
 }
 static boolean callback(URI uri) {
  return (("https".equals(uri.getScheme()) && "onbreax.github.io".equals(uri.getHost())
   && "/mes-depenses-retour.html".equals(uri.getPath()) && (uri.getPort() == -1 || uri.getPort() == 443))
   || ("mesdepenses".equals(uri.getScheme()) && "retour".equals(uri.getHost()) && (uri.getPath() == null || uri.getPath().isEmpty())))
   && uri.getUserInfo() == null && uri.getFragment() == null;
 }
}
