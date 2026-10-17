import { Link } from 'react-router-dom';

export default function Cards() {
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold">Card linking unavailable</h1>
      <p className="mt-4">Card linking is paused until payment verification and refunds are supported. No card-linking charge will be requested.</p>
      <Link className="mt-6 inline-block underline" to="/dashboard">Return to wallet</Link>
    </main>
  );
}
