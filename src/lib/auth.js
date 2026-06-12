/**
 * src/lib/auth.js – Auth-Operationen
 * 
 * Alle Authentifizierungs- und Session-Operationen sind hier zentralisiert.
 * Named exports für alle Auth-Funktionen.
 */

import { supabase } from './supabase'

// ─── SIGN IN / SIGN UP ─────────────────────────────────────────────────
/**
 * Benutzer anmelden mit E-Mail und Passwort
 */
export async function signIn(email, password) {
  return await supabase.auth.signInWithPassword({
    email,
    password,
  })
}

/**
 * Neuer Benutzer registrieren
 */
export async function signUp(email, password) {
  return await supabase.auth.signUp({
    email,
    password,
  })
}

/**
 * Benutzer abmelden
 */
export async function signOut() {
  return await supabase.auth.signOut()
}

// ─── SESSION & USER ───────────────────────────────────────────────────
/**
 * Aktuelle Session laden
 */
export async function getSession() {
  return await supabase.auth.getSession()
}

/**
 * Aktuellen Benutzer laden
 */
export async function getUser() {
  return await supabase.auth.getUser()
}

// ─── AUTH STATE CHANGES ────────────────────────────────────────────────
/**
 * Listener für Auth-State-Änderungen registrieren
 * @param {Function} callback - Wird aufgerufen bei Auth-Änderungen
 */
export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
    callback(newSession)
  })
  return subscription
}
