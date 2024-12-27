import React from 'react';
import { RefreshCw, Users, ExternalLink } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

export interface WaitlistSegment {
  flightNumber: string;
  date: string;
  position: number | null;
  totalWaitlisted: number | null;
  error?: string;
}

export interface WaitlistData {
  segments: WaitlistSegment[];
  error?: string;
}

interface WaitlistResultsProps {
  data: WaitlistData;
  onRefresh: () => void;
}

export function WaitlistResults({ data, onRefresh }: WaitlistResultsProps) {
  if (!data || !data.segments || data.segments.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {data.segments.map((segment, index) => (
        <Card key={index}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-2xl">AS{segment.flightNumber}</CardTitle>
                <CardDescription>
                  {segment.date}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                className="h-8"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div className="grid gap-4">
              <div className="space-y-2">
                <div className="flex items-center text-sm">
                  <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>Your Position:</span>
                  <span className="ml-1 font-medium">
                    {segment.position !== null ? (
                      <>#{segment.position} of {segment.totalWaitlisted || '?'} total</>
                    ) : (
                      'Not found on waitlist'
                    )}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="justify-center">
            <a
              href={`https://www.alaskaair.com/status/${segment.flightNumber}/${segment.date}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center"
            >
              View on Alaska Airlines
              <ExternalLink className="h-4 w-4 ml-1" />
            </a>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
} 