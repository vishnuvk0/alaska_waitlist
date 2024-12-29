'use client';

import React from 'react';
import { RefreshCw, Users, ExternalLink, Plane } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';

export interface WaitlistInfo {
  capacity: number | null;
  available: number | null;
  checkedIn: number | null;
}

export interface WaitlistSegment {
  flightNumber: string;
  date: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  position: number | null;
  totalWaitlisted: number | null;
  waitlistInfo?: WaitlistInfo;
  names?: string[];
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
        <Card key={index} className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-2xl">AS{segment.flightNumber}</CardTitle>
                <CardDescription>
                  {new Date(segment.date).toLocaleDateString()}
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
            {/* Flight Route Information */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2">
                <Plane className="h-4 w-4 text-muted-foreground" />
                <span>{segment.origin}</span>
                <span>→</span>
                <span>{segment.destination}</span>
              </div>
              <div className="text-right text-muted-foreground">
                <div>Departure: {segment.departureTime}</div>
                <div>Arrival: {segment.arrivalTime}</div>
              </div>
            </div>

            {/* Waitlist Status */}
            {segment.waitlistInfo && (
              <div className="grid gap-4">
                <div className="space-y-2">
                  <h4 className="font-semibold">First Class Status</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <Badge variant="secondary" className="mb-1">Capacity</Badge>
                      <p className="text-lg font-medium">{segment.waitlistInfo.capacity ?? 'N/A'}</p>
                    </div>
                    <div className="text-center">
                      <Badge variant="secondary" className="mb-1">Available</Badge>
                      <p className="text-lg font-medium">{segment.waitlistInfo.available ?? 'N/A'}</p>
                    </div>
                    <div className="text-center">
                      <Badge variant="secondary" className="mb-1">Checked In</Badge>
                      <p className="text-lg font-medium">{segment.waitlistInfo.checkedIn ?? 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Your Position */}
            <div className="space-y-2">
              <div className="flex items-center text-sm">
                <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>Your Position:</span>
                <span className={cn(
                  "ml-1 font-medium",
                  segment.position !== null && segment.waitlistInfo && 
                  segment.waitlistInfo.available !== null && 
                  segment.position > segment.waitlistInfo.available && "text-destructive"
                )}>
                  {segment.position !== null ? (
                    <>
                      #{segment.position} of {segment.totalWaitlisted || '?'} total
                      {segment.waitlistInfo && segment.waitlistInfo.available !== null && (
                        <span className="ml-2">
                          {segment.position <= segment.waitlistInfo.available ? (
                            <Badge variant="secondary" className="ml-1 bg-green-100 text-green-800">Likely Upgrade</Badge>
                          ) : (
                            <Badge variant="destructive" className="ml-1">Unlikely Upgrade</Badge>
                          )}
                        </span>
                      )}
                    </>
                  ) : (
                    'Not found on waitlist'
                  )}
                </span>
              </div>
              {segment.waitlistInfo && segment.waitlistInfo.available !== null && (
                <p className="text-sm text-muted-foreground">
                  {segment.waitlistInfo.available} seats available for upgrade
                </p>
              )}
            </div>

            {/* Waitlist Names */}
            {segment.names && segment.names.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold">Current Waitlist</h4>
                <div className="bg-muted rounded-lg p-4">
                  <ol className="list-decimal list-inside space-y-1">
                    {segment.names.map((name, i) => (
                      <li key={i} className={cn(
                        "text-sm py-1 px-2 rounded",
                        segment.position === i + 1 && "bg-primary/10 font-medium"
                      )}>
                        {name} {segment.position === i + 1 && <span className="text-primary ml-2">← YOU</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}

            {/* Error Message */}
            {segment.error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {segment.error}
              </div>
            )}
          </CardContent>

          <CardFooter className="justify-center border-t bg-muted/50 py-4">
            <a
              href={`https://www.alaskaair.com/status/${segment.flightNumber}/${new Date(segment.date).toISOString().split('T')[0]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-primary"
            >
              View on Alaska Airlines <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
} 