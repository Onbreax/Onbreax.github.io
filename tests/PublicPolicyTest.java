package fr.onbreax.premiereauto;
import java.net.URI;
public class PublicPolicyTest {
 public static void main(String[] args)throws Exception {
  String[] yes={"https://onbreax.github.io/premiere-auto-data.json","https://onbreax.github.io/premiere-auto-data.json?v=1792000000000","https://geo.api.gouv.fr/communes?codePostal=75019&fields=nom%2Ccentre%2Ccode%2CcodesPostaux&format=json"};
  String[] no={"http://onbreax.github.io/premiere-auto-data.json","https://onbreax.github.io/mes-depenses.html","https://onbreax.github.io/premiere-auto-data.json?token=x","https://onbreax.github.io.evil.test/premiere-auto-data.json","https://user@onbreax.github.io/premiere-auto-data.json","https://geo.api.gouv.fr:443/communes?codePostal=75019&fields=nom,centre,code,codesPostaux&format=json","https://geo.api.gouv.fr/communes?codePostal=75019&codePostal=44000&fields=nom,centre,code,codesPostaux&format=json","https://geo.api.gouv.fr/communes?lat=48&lon=2","https://api.enablebanking.com/accounts/abc/transactions","https://onbreax.github.io/%70remiere-auto-data.json"};
  for(String u:yes)if(!PublicPolicy.allowed(new URI(u)))throw new AssertionError("Allowed request rejected: "+u);
  for(String u:no)if(PublicPolicy.allowed(new URI(u)))throw new AssertionError("Unsafe request allowed: "+u);
  System.out.println("Native public transport: only the dated inventory and bounded postcode lookup are allowed.");
 }
}
