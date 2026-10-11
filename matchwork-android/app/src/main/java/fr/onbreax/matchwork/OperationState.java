package fr.onbreax.matchwork;

/** A single user operation. Late messages cannot stop a newer run. */
final class OperationState {
 private String token;
 private boolean stopping;
 synchronized boolean begin(String next) {
  if (token != null || next == null || next.isEmpty()) return false;
  token = next; stopping = false; return true;
 }
 synchronized boolean isCurrent(String value) { return token != null && token.equals(value); }
 synchronized boolean isRunning() { return token != null; }
 synchronized boolean canRequest(String value) { return isCurrent(value) && !stopping; }
 synchronized String token() { return token; }
 synchronized boolean requestStop(String value) {
  if (!isCurrent(value)) return false;
  stopping = true; return true;
 }
 synchronized boolean end(String value) {
  if (!isCurrent(value)) return false;
  token = null; stopping = false; return true;
 }
}
