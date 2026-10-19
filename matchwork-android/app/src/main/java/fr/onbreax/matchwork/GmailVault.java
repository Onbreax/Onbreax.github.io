package fr.onbreax.matchwork;
import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import java.security.KeyStore;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.json.JSONObject;

/** Only authenticated ciphertext is stored. Keys stay in Android Keystore. */
final class GmailVault {
 private static final String ALIAS="matchwork-gmail-app-password-v1";
 private final SharedPreferences prefs;
 GmailVault(Context context){prefs=context.getSharedPreferences("gmail-app-passwords",Context.MODE_PRIVATE);}
 private javax.crypto.SecretKey key() throws Exception {
  KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
  if(!store.containsAlias(ALIAS)){
   KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
   generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generator.generateKey();
  }
  return (javax.crypto.SecretKey)store.getKey(ALIAS,null);
 }
 void put(String profile,String email,String password) throws Exception {
  Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
  byte[] bytes=new JSONObject().put("email",email).put("password",password).toString().getBytes(StandardCharsets.UTF_8);
  String value=Base64.getEncoder().encodeToString(cipher.getIV())+":"+Base64.getEncoder().encodeToString(cipher.doFinal(bytes));
  if(!prefs.edit().putString(profile,value).commit())throw new java.io.IOException("Le téléphone n’a pas enregistré le mot de passe chiffré.");
 }
 JSONObject get(String profile) throws Exception {
  String value=prefs.getString(profile,null);if(value==null)return null;String[] parts=value.split(":",2);
  Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.getDecoder().decode(parts[0])));
  return new JSONObject(new String(cipher.doFinal(Base64.getDecoder().decode(parts[1])),StandardCharsets.UTF_8));
 }
 void forget(String profile){prefs.edit().remove(profile).commit();}
}
