'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

export interface WaitlistFormData {
  flightNumber: string;
  flightDate: string;
  userName: string;
}

interface WaitlistFormProps {
  onSubmit: (data: WaitlistFormData, forceRefresh?: boolean) => void;
  defaultUserName?: string;
}

export function WaitlistForm({ onSubmit, defaultUserName }: WaitlistFormProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<WaitlistFormData>({
    defaultValues: {
      userName: defaultUserName || ''
    }
  });

  return (
    <form onSubmit={handleSubmit((data) => onSubmit(data, false))} className="space-y-4">
      <div>
        <Label htmlFor="flightNumber">Flight Number</Label>
        <Input
          id="flightNumber"
          placeholder="e.g. 1234"
          {...register('flightNumber', { required: true })}
          className={errors.flightNumber ? 'border-red-500' : ''}
        />
        {errors.flightNumber && (
          <p className="text-red-500 text-sm">Flight number is required</p>
        )}
      </div>

      <div>
        <Label htmlFor="flightDate">Flight Date</Label>
        <Input
          id="flightDate"
          type="date"
          {...register('flightDate', { required: true })}
          className={errors.flightDate ? 'border-red-500' : ''}
        />
        {errors.flightDate && (
          <p className="text-red-500 text-sm">Flight date is required</p>
        )}
      </div>

      <div>
        <Label htmlFor="userName">Your Name on Waitlist</Label>
        <Input
          id="userName"
          placeholder="e.g. DOE/J"
          {...register('userName', { required: true })}
          className={errors.userName ? 'border-red-500' : ''}
          disabled={!!defaultUserName}
        />
        {errors.userName && (
          <p className="text-red-500 text-sm">Name is required</p>
        )}
      </div>

      <Button type="submit" className="w-full">
        Check Waitlist
      </Button>
    </form>
  );
} 