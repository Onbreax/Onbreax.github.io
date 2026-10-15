package fr.onbreax.premiereauto;
import java.net.URI;
import java.util.HashSet;
import java.util.Set;
public final class PublicPolicy {
 public static boolean allowed(URI uri) {
  if(uri==null||!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||uri.getPort()!=-1||uri.getFragment()!=null||uri.getRawPath().contains("%"))return false;
  String host=uri.getHost(),path=uri.getPath(),q=uri.getQuery();
  if("onbreax.github.io".equals(host))return "/premiere-auto-data.json".equals(path)&&(q==null||q.matches("v=[0-9]{1,16}"));
  if(!"geo.api.gouv.fr".equals(host)||!"/communes".equals(path)||q==null)return false;
  Set<String> keys=new HashSet<>();
  for(String part:q.split("&",-1)){
   String[] pair=part.split("=",-1);if(pair.length!=2||!keys.add(pair[0]))return false;
   if("codePostal".equals(pair[0])){if(!pair[1].matches("[0-9]{5}"))return false;}
   else if("format".equals(pair[0])){if(!"json".equals(pair[1]))return false;}
   else if("fields".equals(pair[0])){if(!"nom,centre,code,codesPostaux".equals(pair[1]))return false;}
   else return false;
  }
  return keys.contains("codePostal")&&keys.contains("fields")&&keys.contains("format");
 }
 private PublicPolicy(){}
}
