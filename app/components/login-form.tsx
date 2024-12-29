'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { EliteStatus } from '../lib/elite-status-tracker';

interface LoginFormData {
  username: string;
  password: string;
}

interface SignupFormData extends LoginFormData {
  first_name: string;
  last_name: string;
  status_level: EliteStatus;
}

export function LoginForm() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors }, reset } = useForm<SignupFormData>();

  const onSubmit = async (data: SignupFormData) => {
    try {
      setError(null);
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Authentication failed');
      }

      // Store user data and redirect
      localStorage.setItem('user', JSON.stringify(result.user));
      reset();
      router.push('/dashboard');
    } catch (error) {
      console.error('Error:', error);
      setError(error instanceof Error ? error.message : 'Authentication failed');
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-center">
        {isLogin ? 'Login' : 'Create Account'}
      </h2>
      
      {error && (
        <div className="mb-4 p-3 text-sm text-red-500 bg-red-100 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {!isLogin && (
          <>
            <div>
              <Label htmlFor="first_name">First Name</Label>
              <Input
                id="first_name"
                {...register('first_name', { required: !isLogin })}
                className={errors.first_name ? 'border-red-500' : ''}
              />
              {errors.first_name && (
                <p className="text-red-500 text-sm">First name is required</p>
              )}
            </div>

            <div>
              <Label htmlFor="last_name">Last Name</Label>
              <Input
                id="last_name"
                {...register('last_name', { required: !isLogin })}
                className={errors.last_name ? 'border-red-500' : ''}
              />
              {errors.last_name && (
                <p className="text-red-500 text-sm">Last name is required</p>
              )}
            </div>

            <div>
              <Label htmlFor="status_level">Status Level</Label>
              <select
                id="status_level"
                {...register('status_level', { required: !isLogin })}
                className="w-full p-2 border rounded"
              >
                <option value={EliteStatus.MVP}>MVP</option>
                <option value={EliteStatus.MVP_GOLD}>MVP Gold</option>
                <option value={EliteStatus.MVP_GOLD_75K}>MVP Gold 75K</option>
              </select>
              {errors.status_level && (
                <p className="text-red-500 text-sm">Status level is required</p>
              )}
            </div>
          </>
        )}

        <div>
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            {...register('username', { required: true })}
            className={errors.username ? 'border-red-500' : ''}
          />
          {errors.username && (
            <p className="text-red-500 text-sm">Username is required</p>
          )}
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            {...register('password', { required: true })}
            className={errors.password ? 'border-red-500' : ''}
          />
          {errors.password && (
            <p className="text-red-500 text-sm">Password is required</p>
          )}
        </div>

        <Button type="submit" className="w-full">
          {isLogin ? 'Login' : 'Create Account'}
        </Button>

        <p className="text-center mt-4">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
              reset();
            }}
            className="text-blue-500 hover:text-blue-700"
          >
            {isLogin ? 'Sign up' : 'Login'}
          </button>
        </p>
      </form>
    </div>
  );
} 