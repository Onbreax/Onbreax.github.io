package fr.onbreax.mesdepenses;
import java.net.URI;
public final class BankPolicyTest {
 private static void check(boolean value,String name){if(!value)throw new AssertionError(name);}
 public static void main(String[] args)throws Exception{
  check(BankPolicy.allowed(new URI("https://api.enablebanking.com/application"),"GET"),"application read");
  check(BankPolicy.allowed(new URI("https://api.enablebanking.com/auth"),"POST"),"user consent flow");
  check(BankPolicy.allowed(new URI("https://api.enablebanking.com/sessions"),"POST"),"session creation");
  check(BankPolicy.allowed(new URI("https://api.enablebanking.com/accounts/uid/transactions?date_from=2026-10-01"),"GET"),"transactions read");
  String[] refused={"http://api.enablebanking.com/application","https://api.enablebanking.com.evil.example/application","https://secret@api.enablebanking.com/application","https://api.enablebanking.com:444/application","https://api.enablebanking.com/payments","https://api.enablebanking.com/accounts/../payments","https://api.enablebanking.com/accounts/%2e%2e/transactions"};
  for(String u:refused)check(!BankPolicy.allowed(new URI(u),"GET"),"refused "+u);
  check(!BankPolicy.allowed(new URI("https://api.enablebanking.com/payments"),"POST"),"no payment creation");
  check(!BankPolicy.allowed(new URI("https://api.enablebanking.com/sessions/id"),"DELETE"),"no arbitrary deletion");
  check(BankPolicy.callback(new URI("https://onbreax.github.io/mes-depenses-retour.html?code=fake&state=fake")),"HTTPS callback");
  check(BankPolicy.callback(new URI("mesdepenses://retour?code=fake&state=fake")),"APK fallback callback");
  check(!BankPolicy.callback(new URI("https://evil.example/mes-depenses-retour.html?code=fake")),"foreign callback refused");
  System.out.println("Android read-only network and callback policy passed.");
 }
}
