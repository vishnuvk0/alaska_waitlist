'use client';

import { useState } from 'react';
import { WaitlistForm, type WaitlistFormData } from '@/components/WaitlistForm';
import { WaitlistResults, type WaitlistData } from '@/components/WaitlistResults';
import { fetchWithTimeout } from '@/lib/server-utils';
import { validateFlightInput } from '@/lib/flight-utils';

export default function Home() {
  const [waitlistData, setWaitlistData] = useState<WaitlistData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFormData, setLastFormData] = useState<WaitlistFormData | null>(null);

  const handleSubmit = async (data: WaitlistFormData) => {
    setLoading(true);
    setError(null);
    setLastFormData(data);

    // Validate input
    const validationError = validateFlightInput(data.flightNumber, data.flightDate);
    if (validationError) {
      setError(validationError);
      setLoading(false);
      return;
    }

    try {
      const response = await fetchWithTimeout('/api/trackWaitlist', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(data),
        timeout: 60000 // 60 seconds timeout
      });
      
      if (!response.ok) {
        let errorMessage = `Failed to fetch waitlist data: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If we can't parse the error JSON, use the default message
        }
        throw new Error(errorMessage);
      }

      const responseData = await response.json();
      
      if (responseData.error && !responseData.segments) {
        setError(responseData.error);
        setWaitlistData(null);
      } else {
        setWaitlistData(responseData);
      }
    } catch (err) {
      console.error('Error fetching waitlist:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch waitlist data');
      setWaitlistData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (lastFormData) {
      handleSubmit(lastFormData);
    }
  };

  return (
    <main className="container mx-auto p-4 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8 text-center"> Waitlist Checker</h1>
      <div className="space-y-8">
        <WaitlistForm onSubmit={handleSubmit} />
        {loading && (
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-2 text-gray-600">Checking waitlist...</p>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
            <p className="font-bold">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        )}
        {waitlistData && <WaitlistResults data={waitlistData} onRefresh={handleRefresh} />}
      </div>
    </main>
  );
} 