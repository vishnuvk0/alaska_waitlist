import React from 'react';
import { useForm } from 'react-hook-form';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { CalendarIcon, Plane, User, Search } from 'lucide-react';

export interface WaitlistFormData {
  flightNumber: string;
  flightDate: string;
  userName: string;
}

interface WaitlistFormProps {
  onSubmit: (data: WaitlistFormData) => void;
}

export function WaitlistForm({ onSubmit }: WaitlistFormProps): React.ReactElement {
  const today = new Date().toISOString().split('T')[0];
  
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<WaitlistFormData>({
    defaultValues: {
      flightNumber: '',
      flightDate: today,
      userName: ''
    }
  });

  const handleFormSubmit = (data: WaitlistFormData) => {
    // Create a clean copy of the data
    const cleanData = {
      flightNumber: data.flightNumber.trim(),
      flightDate: data.flightDate,
      userName: data.userName.trim().toUpperCase()
    };
    onSubmit(cleanData);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="flightNumber" className="flex items-center justify-between">
              <span>Flight Number</span>
              <span className="text-xs text-muted-foreground">e.g. 3411</span>
            </Label>
            <div className="relative">
              <Plane className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
              <Input
                {...register('flightNumber', {
                  required: 'Flight number is required',
                  pattern: {
                    value: /^\d{1,5}$/,
                    message: 'Please enter a valid flight number (3-4 digits)'
                  }
                })}
                id="flightNumber"
                placeholder="Enter flight number"
                className="pl-10"
              />
            </div>
            {errors.flightNumber && (
              <p className="text-sm text-destructive">{errors.flightNumber.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="flightDate" className="flex items-center justify-between">
              <span>Flight Date</span>
              <span className="text-xs text-muted-foreground">Select date</span>
            </Label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
              <Input
                {...register('flightDate', {
                  required: 'Flight date is required'
                })}
                type="date"
                id="flightDate"
                min={today}
                className="pl-10"
              />
            </div>
            {errors.flightDate && (
              <p className="text-sm text-destructive">{errors.flightDate.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="userName" className="flex items-center justify-between">
              <span>Your Name</span>
              <span className="text-xs text-muted-foreground">Format: LASTNAME/F</span>
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
              <Input
                {...register('userName', {
                  required: 'Name is required',
                  pattern: {
                    value: /^[A-Z]{2,3}\/[A-Z]$/,
                    message: 'Format: LASTNAME/F (e.g., DOE/J)'
                  }
                })}
                id="userName"
                placeholder="Enter your name to highlight your position"
                className="pl-10"
              />
            </div>
            {errors.userName && (
              <p className="text-sm text-destructive">{errors.userName.message}</p>
            )}
          </div>

          <Button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Checking Waitlist...
              </>
            ) : (
              <>
                <Search className="mr-2 h-5 w-5" />
                Check Waitlist
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
} 