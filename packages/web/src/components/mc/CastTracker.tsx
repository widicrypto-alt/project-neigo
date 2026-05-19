/**
 * Cast Tracker Component
 * Shows progress of discovering cast members in a story
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { 
  Users, 
  Check, 
  Clock, 
  Heart,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Star,
  HelpCircle,
  MapPin
} from 'lucide-react';

export interface CastMemberStatus {
  characterId: string;
  displayName: string;
  role: 'mc' | 'harem' | 'npc' | 'supporting';
  avatarUrl?: string | null;
  tagline?: string | null;
  met: boolean;
  firstMetAt?: Date | null;
  encounterCount: number;
  trustDelta: number;
  affectionDelta: number;
}

export interface CastProgress {
  total: number;
  met: number;
  remaining: number;
  percentage: number;
  isComplete: boolean;
  favoriteCast?: string | null;
}

export interface CastTrackerProps {
  progress: CastProgress;
  members: CastMemberStatus[];
  showHints?: boolean;
  onRequestHint?: () => void;
  className?: string;
}

export function CastTracker({
  progress,
  members,
  showHints = true,
  onRequestHint,
  className,
}: CastTrackerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const roleColors: Record<string, string> = {
    mc: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
    harem: 'bg-pink-500/20 text-pink-600 border-pink-500/30',
    npc: 'bg-blue-500/20 text-blue-600 border-blue-500/30',
    supporting: 'bg-gray-500/20 text-gray-600 border-gray-500/30',
  };

  const roleLabels: Record<string, string> = {
    mc: 'MC',
    harem: 'Harem',
    npc: 'NPC',
    supporting: 'Supporting',
  };

  const unmetMembers = members.filter(m => !m.met);
  const metMembers = members.filter(m => m.met);

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5" />
            Cast Progress
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2 mt-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {progress.met} / {progress.total} discovered
            </span>
            <span className="font-medium">{progress.percentage}%</span>
          </div>
          <Progress value={progress.percentage} className="h-2" />
        </div>

        {/* Status Badges */}
        <div className="flex gap-2 mt-2">
          {progress.isComplete ? (
            <Badge className="bg-green-500/20 text-green-600 border-green-500/30">
              <Check className="w-3 h-3 mr-1" />
              Complete!
            </Badge>
          ) : progress.remaining > 0 ? (
            <Badge variant="secondary">
              <HelpCircle className="w-3 h-3 mr-1" />
              {progress.remaining} remaining
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      {/* Expanded View */}
      {isExpanded && (
        <CardContent className="space-y-4">
          {/* Harem Members (Priority) */}
          {metMembers.some(m => m.role === 'harem') && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-pink-600 uppercase tracking-wide">
                <Heart className="w-3 h-3 inline mr-1" />
                Harem Members
              </div>
              <div className="grid grid-cols-2 gap-2">
                {members
                  .filter(m => m.role === 'harem')
                  .map(member => (
                    <CastMemberCard 
                      key={member.characterId} 
                      member={member}
                      roleColors={roleColors}
                      roleLabels={roleLabels}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Met Members */}
          {metMembers.filter(m => m.role !== 'harem').length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Check className="w-3 h-3 inline mr-1" />
                Met ({metMembers.filter(m => m.role !== 'harem').length})
              </div>
              <div className="grid grid-cols-2 gap-2">
                {metMembers
                  .filter(m => m.role !== 'harem')
                  .map(member => (
                    <CastMemberCard 
                      key={member.characterId} 
                      member={member}
                      roleColors={roleColors}
                      roleLabels={roleLabels}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Unmet Members */}
          {unmetMembers.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <HelpCircle className="w-3 h-3 inline mr-1" />
                Not Yet Met ({unmetMembers.length})
              </div>
              <div className="grid grid-cols-2 gap-2">
                {unmetMembers.map(member => (
                  <UnmetMemberCard 
                    key={member.characterId} 
                    member={member}
                    roleColors={roleColors}
                    roleLabels={roleLabels}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Hint Button */}
          {showHints && onRequestHint && unmetMembers.length > 0 && (
            <Button 
              variant="outline" 
              className="w-full mt-2"
              onClick={onRequestHint}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Butuh petunjuk?
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// Individual Cast Member Card
interface CastMemberCardProps {
  member: CastMemberStatus;
  roleColors: Record<string, string>;
  roleLabels: Record<string, string>;
}

function CastMemberCard({ member, roleColors, roleLabels }: CastMemberCardProps) {
  const initials = member.displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
            <Avatar className="w-8 h-8">
              <AvatarImage src={member.avatarUrl ?? undefined} />
              <AvatarFallback className="text-xs bg-amber-500/20 text-amber-600">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate flex items-center gap-1">
                {member.met && <Check className="w-3 h-3 text-green-500 flex-shrink-0" />}
                <span className="truncate">{member.displayName}</span>
              </div>
              <Badge 
                variant="outline" 
                className={cn('text-[10px] px-1 py-0', roleColors[member.role])}
              >
                {roleLabels[member.role]}
              </Badge>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <div className="font-medium">{member.displayName}</div>
            {member.tagline && (
              <div className="text-xs text-muted-foreground">{member.tagline}</div>
            )}
            <div className="text-xs">
              {member.encounterCount}x encounter{typeof member.encounterCount === 'number' && member.encounterCount !== 1 ? 's' : ''}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Unmet Member Card (no avatar)
interface UnmetMemberCardProps {
  member: CastMemberStatus;
  roleColors: Record<string, string>;
  roleLabels: Record<string, string>;
}

function UnmetMemberCard({ member, roleColors, roleLabels }: UnmetMemberCardProps) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border border-dashed border-muted hover:border-amber-500/50 transition-colors opacity-60">
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
        <HelpCircle className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-muted-foreground truncate">
          ??? (Misterius)
        </div>
        <Badge 
          variant="outline" 
          className={cn('text-[10px] px-1 py-0', roleColors[member.role])}
        >
          {roleLabels[member.role]}
        </Badge>
      </div>
    </div>
  );
}

// Compact Progress Indicator (for inline display)
interface CastProgressCompactProps {
  progress: CastProgress;
  className?: string;
}

export function CastProgressCompact({ progress, className }: CastProgressCompactProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex items-center gap-2', className)}>
            <Users className="w-4 h-4 text-muted-foreground" />
            <div className="flex items-center gap-1">
              <span className="font-medium">{progress.met}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-muted-foreground">{progress.total}</span>
            </div>
            {progress.isComplete && (
              <Badge className="text-[10px] px-1 py-0 bg-green-500/20 text-green-600">
                <Star className="w-2 h-2 mr-1" />
                Complete
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <div className="font-medium">Cast Discovery</div>
            <div className="text-muted-foreground">
              {progress.met} of {progress.total} cast members met
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
