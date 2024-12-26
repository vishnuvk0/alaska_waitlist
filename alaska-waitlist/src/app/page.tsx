'use client';

import { useState } from "react";

export default function Home() {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const flightNumber = formData.get('flightNumber');
    const flightDate = formData.get('flightDate');
    const userName = formData.get('userName');

    try {
      const response = await fetch('/api/trackWaitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flightNumber, flightDate, userName })
      });
      const data = await response.json();

      if (data.error) {
        setResult(`Error: ${data.error}`);
        return;
      }

      let message = '';
      if (data.message) {
        message += data.message + '\n';
      }
      if (data.waitlistOrder) {
        message += `\nCurrent Waitlist Order:\n${data.waitlistOrder.join('\n')}\n`;
      }
      if (data.newNames?.length > 0) {
        message += `\nNew additions to waitlist:\n${data.newNames.join('\n')}\n`;
      }
      if (data.droppedNames?.length > 0) {
        message += `\nDropped from waitlist:\n${data.droppedNames.join('\n')}\n`;
      }

      setResult(message);
    } catch (err) {
      console.error(err);
      setResult('An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-6">Flight Waitlist Tracker</h1>
      
      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div>
          <label className="block mb-2">
            Flight Number:
            <input
              type="text"
              name="flightNumber"
              placeholder="e.g. 3411"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
        </div>

        <div>
          <label className="block mb-2">
            Flight Date:
            <input
              type="date"
              name="flightDate"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
        </div>

        <div>
          <label className="block mb-2">
            Your Name (LastName/FirstInitial):
            <input
              type="text"
              name="userName"
              placeholder="KUM/V"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-blue-300"
        >
          {loading ? 'Checking...' : 'Check Waitlist'}
        </button>
      </form>

      {result && (
        <pre className="mt-8 p-4 bg-gray-100 rounded-md whitespace-pre-wrap">
          {result}
        </pre>
      )}
    </div>
  );
}
