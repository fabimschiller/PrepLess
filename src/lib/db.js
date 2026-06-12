/**
 * src/lib/db.js – Datenbankoperationen
 * 
 * Alle Datenbankzugriffe sind hier zentralisiert.
 * Named exports für alle DB-Funktionen.
 * Jede Funktion gibt { data, error } zurück wie Supabase es tut.
 */

import { supabase } from './supabase'

// ─── CLASSES ───────────────────────────────────────────────────────────
export async function getClasses() {
  return await supabase
    .from('classes')
    .select('id, name, subject, subjects, school_type, grade, state, created_at')
    .order('created_at', { ascending: false })
}

export async function createClass(userId, formData) {
  return await supabase
    .from('classes')
    .insert({
      user_id: userId,
      name: formData.name.trim(),
      subject: formData.subjects[0] ?? '',
      subjects: formData.subjects,
      school_type: formData.school_type,
      grade: formData.grade.trim(),
      state: formData.state,
    })
    .select()
    .single()
}

export async function updateClass(classId, editValues) {
  return await supabase
    .from('classes')
    .update({
      name: editValues.name.trim(),
      subject: editValues.subjects[0] ?? editValues.name,
      subjects: editValues.subjects,
      school_type: editValues.school_type,
      grade: editValues.grade.trim(),
      state: editValues.state,
    })
    .eq('id', classId)
    .select()
    .single()
}

export async function deleteClass(classId) {
  return await supabase
    .from('classes')
    .delete()
    .eq('id', classId)
}

// ─── STUDENTS ──────────────────────────────────────────────────────────
export async function getStudents(classId) {
  return await supabase
    .from('students')
    .select('id, class_id, name, notes, created_at')
    .eq('class_id', classId)
    .order('name', { ascending: true })
}

export async function getStudentsByClass(classId, orderBy = 'name') {
  return await supabase
    .from('students')
    .select('id, class_id, name, notes, created_at')
    .eq('class_id', classId)
    .order(orderBy, { ascending: orderBy === 'name' ? true : false })
}

export async function getStudentsByIds(studentIds) {
  return await supabase
    .from('students')
    .select('id, name, notes')
    .in('id', studentIds)
}

export async function getObservationsByStudentIds(studentIds) {
  return await supabase
    .from('observations')
    .select('student_id, note, created_at')
    .in('student_id', studentIds)
    .order('created_at', { ascending: false })
}

export async function createStudent(classId, name, notes) {
  return await supabase
    .from('students')
    .insert({
      class_id: classId,
      name,
      notes: notes.trim() || null,
    })
    .select()
    .single()
}

export async function updateStudent(studentId, name, notes) {
  return await supabase
    .from('students')
    .update({
      name: name.trim(),
      notes: notes.trim() || null,
    })
    .eq('id', studentId)
    .select()
    .single()
}

export async function deleteStudent(studentId) {
  return await supabase
    .from('students')
    .delete()
    .eq('id', studentId)
}

// ─── LESSONS ───────────────────────────────────────────────────────────
export async function getLessons(classId, limit = 5) {
  return await supabase
    .from('lessons')
    .select('id, title, content, position, curriculum_unit_id, status, conducted_at, class_id, generated_at')
    .eq('class_id', classId)
    .order('generated_at', { ascending: false })
    .limit(limit)
}

export async function getLesson(lessonId) {
  return await supabase
    .from('lessons')
    .select('*')
    .eq('id', lessonId)
    .maybeSingle()
}

export async function createLesson(classId, curriculumUnitId, position, title, content) {
  return await supabase
    .from('lessons')
    .insert({
      class_id: classId,
      curriculum_unit_id: curriculumUnitId,
      position,
      title: title.trim(),
      content: content.trim(),
    })
    .select()
    .single()
}

export async function updateLesson(lessonId, data) {
  return await supabase
    .from('lessons')
    .update(data)
    .eq('id', lessonId)
    .select()
    .single()
}

export async function upsertLesson(lessonData) {
  return await supabase
    .from('lessons')
    .upsert(lessonData, { onConflict: 'id' })
    .select()
    .single()
}

export async function deleteLesson(lessonId) {
  return await supabase
    .from('lessons')
    .delete()
    .eq('id', lessonId)
}

export async function markLessonConducted(lessonId, status = 'conducted') {
  const now = new Date().toISOString()
  return await supabase
    .from('lessons')
    .update({ status, conducted_at: now })
    .eq('id', lessonId)
}

// ─── CURRICULUM UNITS ──────────────────────────────────────────────────
export async function getCurriculumUnits(classId, subject = null) {
  let query = supabase
    .from('curriculum_units')
    .select(
      'id, class_id, subject, position, title, description, estimated_hours, start_month, end_month'
    )
    .eq('class_id', classId)
  // subject-Filter: exaktes Fach ODER subject IS NULL (Altdaten ohne Fach-Zuordnung)
  if (subject) query = query.or(`subject.eq.${subject},subject.is.null`)
  return query.order('position', { ascending: true })
}

export async function createCurriculumUnit(classId, unitData) {
  return await supabase
    .from('curriculum_units')
    .insert({
      class_id: classId,
      ...unitData,
    })
    .select()
    .single()
}

export async function updateCurriculumUnit(unitId, editValues) {
  return await supabase
    .from('curriculum_units')
    .update({
      title: editValues.title.trim(),
      description: editValues.description.trim(),
      estimated_hours: Number(editValues.estimated_hours),
      start_month: Number(editValues.start_month),
      end_month: Number(editValues.end_month),
    })
    .eq('id', unitId)
    .select()
    .single()
}

export async function deleteCurriculumUnit(unitId) {
  return await supabase
    .from('curriculum_units')
    .delete()
    .eq('id', unitId)
}

export async function deleteCurriculumUnitsByClass(classId) {
  return await supabase
    .from('curriculum_units')
    .delete()
    .eq('class_id', classId)
}

export async function deleteCurriculumUnitsBySubject(classId, subject) {
  return await supabase
    .from('curriculum_units')
    .delete()
    .eq('class_id', classId)
    .or(`subject.eq.${subject},subject.is.null`)
}

// ─── OBSERVATIONS ──────────────────────────────────────────────────────
export async function getObservations(studentIds) {
  return await supabase
    .from('observations')
    .select('student_id, note')
    .in('student_id', studentIds)
    .order('created_at', { ascending: false })
}

export async function getObservationsByLesson(lessonId) {
  return await supabase
    .from('observations')
    .select('*')
    .eq('lesson_id', lessonId)
}

export async function createObservation(observationData) {
  return await supabase
    .from('observations')
    .insert(observationData)
}

export async function createObservations(rows) {
  return await supabase
    .from('observations')
    .insert(rows)
}

// ─── PROFILE ───────────────────────────────────────────────────────────
export async function getProfile(userId) {
  return await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
}

export async function getProfileDefaultSchoolType(userId) {
  return await supabase
    .from('profiles')
    .select('default_school_type')
    .eq('id', userId)
    .single()
}

export async function getProfileXpAndLevel(userId) {
  return await supabase
    .from('profiles')
    .select('total_xp, level')
    .eq('id', userId)
    .single()
}

export async function updateProfile(userId, updates) {
  return await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
}

export async function upsertProfile(profileData) {
  return await supabase
    .from('profiles')
    .upsert(profileData, { onConflict: 'id' })
}

export async function updateProfileXp(userId, newTotal) {
  return await supabase
    .from('profiles')
    .update({ total_xp: newTotal })
    .eq('id', userId)
}

// ─── LEARNING PROGRESS ────────────────────────────────────────────────
export async function getLearningProgress(userId) {
  return await supabase
    .from('learning_progress')
    .select(`
      id,
      resource_title,
      resource_type,
      xp_earned,
      viewed_at,
      lesson_id,
      lessons(title)
    `)
    .eq('user_id', userId)
    .order('viewed_at', { ascending: false })
}

export async function getLearningProgressByLesson(userId, lessonId) {
  return await supabase
    .from('learning_progress')
    .select('resource_title')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
}

export async function createLearningProgress(userId, lessonId, resourceTitle, resourceType, xpEarned) {
  return await supabase
    .from('learning_progress')
    .insert({
      user_id: userId,
      lesson_id: lessonId,
      resource_title: resourceTitle,
      resource_type: resourceType,
      xp_earned: xpEarned,
    })
}

export async function createLearningProgressBatch(rows) {
  return await supabase
    .from('learning_progress')
    .insert(rows)
}
