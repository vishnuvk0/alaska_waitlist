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

  const handleSubmit = async (formData: WaitlistFormData, forceRefresh: boolean = false) => {
    setLoading(true);
    setError(null);
    setLastFormData(formData);

    // Validate input
    const validationError = validateFlightInput(formData.flightNumber, formData.flightDate);
    if (validationError) {
      setError(validationError);
      setLoading(false);
      return;
    }

    try {
      const requestData = {
        flightNumber: formData.flightNumber,
        flightDate: formData.flightDate,
        userName: formData.userName,
        forceRefresh
      };
      
      const response = await fetchWithTimeout('/api/trackWaitlist', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestData),
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
      handleSubmit(lastFormData, true);
    }
  };

  return (
    <main className="container mx-auto p-4 max-w-2xl">
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Alaska Airlines Waitlist Tracker</h1>
          <p className="text-muted-foreground">
            Track your position on Alaska Airlines upgrade waitlists
          </p>
        </div>

        <WaitlistForm onSubmit={handleSubmit} />
        
        {loading && (
          <div className="text-center p-4">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="mt-2 text-sm text-muted-foreground">Checking waitlist...</p>
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-md">
            {error}
          </div>
        )}

        {waitlistData && (
          <WaitlistResults 
            data={waitlistData} 
            onRefresh={handleRefresh}
          />
        )}
      </div>
    </main>
  );
} 