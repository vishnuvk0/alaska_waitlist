import { LoginForm } from './components/login-form';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
        <div className="p-6">
          <h1 className="text-3xl font-bold text-center mb-8">
            Alaska Airlines Waitlist Tracker
          </h1>
          <LoginForm />
        </div>
      </div>
    </main>
  );
} 