'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { WaitlistForm, type WaitlistFormData } from '../components/WaitlistForm';
import { WaitlistResults, type WaitlistData } from '../components/WaitlistResults';
import { fetchWithTimeout } from '../lib/server-utils';
import { validateFlightInput } from '../lib/flight-utils';

interface User {
  username: string;
  first_name: string;
  last_name: string;
  status_level: string;
  alaska_name: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [waitlistData, setWaitlistData] = useState<WaitlistData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFormData, setLastFormData] = useState<WaitlistFormData | null>(null);

  useEffect(() => {
    // Check if user is logged in
    const userJson = localStorage.getItem('user');
    if (!userJson) {
      router.push('/');
      return;
    }
    setUser(JSON.parse(userJson));
  }, [router]);

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
        userName: user?.alaska_name || formData.userName, // Use generated Alaska name
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

  const handleLogout = () => {
    localStorage.removeItem('user');
    router.push('/');
  };

  if (!user) {
    return null; // or loading spinner
  }

  return (
    <main className="container mx-auto p-4 max-w-2xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Alaska Airlines Waitlist Tracker</h1>
          <p className="text-muted-foreground">
            Welcome, {user.first_name} {user.last_name} ({user.alaska_name})
          </p>
          <p className="text-sm text-muted-foreground">
            Status: {user.status_level}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 text-sm text-white bg-blue-500 rounded hover:bg-blue-600"
        >
          Logout
        </button>
      </div>

      <div className="space-y-8">
        <WaitlistForm 
          onSubmit={handleSubmit}
          defaultUserName={user.alaska_name}
        />
        
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