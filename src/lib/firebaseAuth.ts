import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

let cachedGoogleAccessToken: string | null = null;

export interface GoogleSignInResult {
  accessToken: string | null;
  idToken: string | null;
  email: string | null;
  displayName: string | null;
}

export async function signInWithGoogleForAumi(): Promise<GoogleSignInResult> {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/userinfo.email');
  provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
  provider.setCustomParameters({ prompt: 'select_account' });

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  cachedGoogleAccessToken = credential?.accessToken || null;
  const idToken = credential?.idToken || null;

  return {
    accessToken: cachedGoogleAccessToken,
    idToken,
    email: result.user.email,
    displayName: result.user.displayName,
  };
}
