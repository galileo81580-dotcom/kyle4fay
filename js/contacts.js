import { firebaseConfig } from './firebase-config.js';

let db = null;
let initialized = false;

async function initFirebase() {
  if (initialized) return;
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js');
  const { getFirestore } = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js');
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  initialized = true;
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function normalizePhone(phone) {
  return phone.replace(/\D/g, '').slice(-10);
}

// Add or update a contact in the unified contacts collection.
// If a contact with the same email exists, merge new data into it.
// This is the single entry point for all form submissions.
export async function addContact({ name, email, phone, source, volunteerRole, message, tags = [] }) {
  await initFirebase();
  const { collection, query, where, getDocs, addDoc, updateDoc, arrayUnion, serverTimestamp } =
    await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js');

  const normalizedEmail = normalizeEmail(email);
  const contactsRef = collection(db, 'contacts');
  const q = query(contactsRef, where('email', '==', normalizedEmail));
  const existing = await getDocs(q);

  const activityEntry = {
    source,
    timestamp: new Date().toISOString(),
    ...(volunteerRole && { volunteerRole }),
    ...(message && { message })
  };

  if (!existing.empty) {
    const docRef = existing.docs[0].ref;
    const updates = {
      updated_at: serverTimestamp(),
      sources: arrayUnion(source),
      activity: arrayUnion(activityEntry)
    };
    if (name) updates.name = name;
    if (phone) updates.phone = normalizePhone(phone);
    if (volunteerRole) updates.volunteer_roles = arrayUnion(volunteerRole);
    if (tags.length) updates.tags = arrayUnion(...tags);
    await updateDoc(docRef, updates);
    return { id: docRef.id, merged: true };
  }

  const newContact = {
    name: name || '',
    email: normalizedEmail,
    phone: phone ? normalizePhone(phone) : '',
    sources: [source],
    volunteer_roles: volunteerRole ? [volunteerRole] : [],
    tags,
    status: 'new',
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    activity: [activityEntry]
  };

  const docRef = await addDoc(contactsRef, newContact);
  return { id: docRef.id, merged: false };
}
