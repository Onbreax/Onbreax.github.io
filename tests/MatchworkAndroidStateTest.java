package fr.onbreax.matchwork;

import java.net.URI;

/** Plain JVM checks: no Android device and no network requests. */
public final class MatchworkAndroidStateTest {
 private static void check(boolean condition, String message) {
  if (!condition) throw new AssertionError(message);
 }
 public static void main(String[] args) throws Exception {
  OperationState state = new OperationState();
  check(!state.begin(null), "invalid token refused");
  check(state.begin("first"), "first operation starts");
  check(!state.begin("second"), "parallel operation blocked");
  check(state.canRequest("first"), "active operation may request");
  check(!state.requestStop("old"), "old notification cannot stop this run");
  check(state.canRequest("first"), "old stop did not change active run");
  check(state.requestStop("first"), "stop request accepted");
  check(state.isRunning(), "service stays active until current response is saved");
  check(!state.canRequest("first"), "no next paid request after stop");
  check(!state.end("old"), "late finish cannot stop active run");
  check(state.end("first"), "matching operation finishes");
  check(!state.isRunning(), "service may release resources");
  check(state.begin("second"), "new operation after finish");
  check(!state.end("first"), "old completion cannot close new operation");
  check(state.canRequest("second"), "new operation remains runnable");
  check(state.end("second"), "new operation finishes");
  String[] allowed = {
   "https://openrouter.ai/api/v1/chat/completions",
   "https://api.adzuna.com/v1/api/jobs/fr/search/1?app_key=fake",
   "https://r.jina.ai/https://example.org/job/1"
  };
  for (String url : allowed) check(NativeHttp.allowed(new URI(url)), "approved endpoint: " + url);
  String[] refused = {
   "http://openrouter.ai/api/v1/chat/completions",
   "https://openrouter.ai:444/api/v1/chat/completions",
   "https://password@openrouter.ai/api/v1/chat/completions",
   "https://openrouter.ai.evil.example/api/v1/chat/completions",
   "https://openrouter.ai/api/v1/credits",
   "https://api.adzuna.com/other",
   "https://example.org/job/1",
   "file:///etc/passwd"
  };
  for (String url : refused) check(!NativeHttp.allowed(new URI(url)), "unapproved endpoint refused");
  System.out.println("Matchwork Android: operation exclusivity, stale tokens, stop boundaries and network endpoint policy passed.");
 }
}
