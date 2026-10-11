package fr.onbreax.matchwork;

/** Overlapping keyboard and navigation areas are measured once on every update. */
final class InsetsPolicy {
 static int bottom(int navigation, int keyboard) {
  return Math.max(0, Math.max(navigation, keyboard));
 }
 static int bottom(int navigation, int keyboard, boolean visible) {
  return bottom(navigation, visible ? keyboard : 0);
 }
}
