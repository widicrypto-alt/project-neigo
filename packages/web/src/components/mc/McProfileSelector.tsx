/**
 * MC Profile Selector Component
 * For selecting which MC profile to use when starting a story
 * Supports: Custom MC Profiles, User's Characters, Anonymous
 * 
 * Redesigned v2: Unified categorized list (no tabs)
 */

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { 
  User, 
  Star, 
  Check,
  Crown,
  UserCircle,
  Sparkles,
  ArrowRight,
  BookOpen,
  Wand2,
  Users
} from 'lucide-react';

import type { McProfile, McProfileFormData } from './McProfileEditor';
import { McProfileEditor } from './McProfileEditor';

// User's character as MC option
export interface CharacterAsMcOption {
  id: string;
  name: string;
  avatarUrl: string | null;
  tagline?: string | null;
  persona: Record<string, unknown>;
  isBuiltIn: boolean;
  ownerId?: string;
}

export interface McProfileSelectorProps {
  profiles: McProfile[];
  characters: CharacterAsMcOption[];
  selectedId?: string | null;
  selectedType?: 'profile' | 'character' | 'anonymous';
  onSelect: (id: string | null, type: 'profile' | 'character' | 'anonymous') => void;
  onCreate: (data: McProfileFormData) => Promise<McProfile>;
  onSetDefault: (profileId: string) => Promise<void>;
  onDelete: (profileId: string) => Promise<void>;
}

export function McProfileSelector({
  profiles,
  characters,
  selectedId,
  selectedType = 'anonymous',
  onSelect,
  onCreate,
  onSetDefault,
  onDelete,
}: McProfileSelectorProps) {
  const t = useTranslations('mc.selector');
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<McProfile | null>(null);

  const handleCreate = async (data: McProfileFormData) => {
    const profile = await onCreate(data);
    onSelect(profile.id, 'profile');
    setEditorOpen(false);
  };

  const handleSetDefault = async (profileId: string) => {
    setIsLoading(true);
    try {
      await onSetDefault(profileId);
      toast({
        title: t('isDefault'),
        description: t('setDefault'),
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: t('createFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isSelected = (id: string | null, type: string) => {
    return selectedId === id && selectedType === type;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-amber-500" />
          {t('title')}
        </h3>
        <Button 
          variant="ghost" 
          size="xs"
          className="h-7 text-xs"
          onClick={() => {
            setEditingProfile(null);
            setEditorOpen(true);
          }}
        >
          <Sparkles className="w-3 h-3 mr-1.5 text-amber-500" />
          {t('createLabel')}
        </Button>
      </div>

      {/* Unified Categorized List */}
      <div className="space-y-6 max-h-[420px] overflow-y-auto ohscroll pr-2 -mr-2 px-0.5">
        
        {/* Section: Quick Access / Anonymous */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
            <Users className="w-3 h-3" />
            {t('quickSelect')}
          </div>
          <Card 
            className={cn(
              'group/mc cursor-pointer border-border/40 bg-muted/20 transition-all hover:bg-muted/40 hover:border-primary/30',
              isSelected(null, 'anonymous') && 'border-primary bg-primary/5 ring-1 ring-primary/20'
            )}
            onClick={() => onSelect(null, 'anonymous')}
          >
            <CardContent className="flex items-center gap-3 p-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 group-hover/mc:scale-105 transition-transform">
                <UserCircle className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{t('anonymousLabel')}</div>
                <div className="text-xs text-muted-foreground truncate opacity-70">
                  {t('anonymousHint')}
                </div>
              </div>
              {isSelected(null, 'anonymous') && (
                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 animate-in zoom-in-50 duration-200">
                  <Check className="w-3 h-3 text-primary-foreground" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Section: Custom Personas */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
              <User className="w-3 h-3" />
              {t('myPersonas')}
              {profiles.length > 0 && (
                <span className="opacity-40 ml-1">({profiles.length})</span>
              )}
            </div>
          </div>
          
          {profiles.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground border border-dashed rounded-xl border-border/20 bg-muted/5">
              <p className="text-[10px] uppercase tracking-widest opacity-50">{t('emptyState')}</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {profiles.map((profile) => (
                <Card 
                  key={profile.id}
                  className={cn(
                    'group/mc cursor-pointer border-border/40 bg-muted/20 transition-all hover:bg-muted/40 hover:border-primary/30',
                    isSelected(profile.id, 'profile') && 'border-primary bg-primary/5 ring-1 ring-primary/20'
                  )}
                  onClick={() => onSelect(profile.id, 'profile')}
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <Avatar className="w-10 h-10 shrink-0 group-hover/mc:scale-105 transition-transform">
                      <AvatarImage src={profile.avatarUrl ?? undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {profile.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium flex items-center gap-2">
                        <span className="truncate">{profile.name}</span>
                        {profile.isDefault && (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[9px] uppercase tracking-wider font-bold bg-amber-500/10 text-amber-500 border-none">
                            <Crown className="w-2.5 h-2.5 mr-0.5" />
                            Default
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate opacity-70">
                        {profile.persona.personality}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!profile.isDefault && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground hover:text-amber-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetDefault(profile.id);
                          }}
                          disabled={isLoading}
                          title={t('setDefault')}
                        >
                          <Star className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {isSelected(profile.id, 'profile') && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center animate-in zoom-in-50 duration-200">
                          <Check className="w-3 h-3 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Section: Built-in Characters */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
            <BookOpen className="w-3 h-3" />
            {t('availableCharacters')}
            {characters.length > 0 && (
              <span className="opacity-40 ml-1">({characters.length})</span>
            )}
          </div>
          
          {characters.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground border border-dashed rounded-xl border-border/20 bg-muted/5">
              <p className="text-[10px] uppercase tracking-widest opacity-50">{t('charactersEmpty')}</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {characters.map((character) => (
                <Card 
                  key={character.id}
                  className={cn(
                    'group/mc cursor-pointer border-border/40 bg-muted/20 transition-all hover:bg-muted/40 hover:border-purple-500/30',
                    isSelected(character.id, 'character') && 'border-purple-500 bg-purple-500/5 ring-1 ring-purple-500/20'
                  )}
                  onClick={() => onSelect(character.id, 'character')}
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <Avatar className="w-10 h-10 shrink-0 border border-border/20 group-hover/mc:scale-105 transition-transform">
                      <AvatarImage src={character.avatarUrl ?? undefined} className="object-cover" />
                      <AvatarFallback className="bg-purple-500/10 text-purple-500 text-xs">
                        {character.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium flex items-center gap-2">
                        <span className="truncate">{character.name}</span>
                        {character.isBuiltIn && (
                          <Badge variant="outline" className="h-4 px-1.5 text-[9px] text-muted-foreground border-muted-foreground/30">
                            Built-in
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-1 opacity-70">
                        {character.tagline ?? t('charactersHint')}
                      </div>
                    </div>
                    {isSelected(character.id, 'character') && (
                      <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center shrink-0 animate-in zoom-in-50 duration-200">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MC Editor Modal */}
      <McProfileEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSave={handleCreate}
        mode="create"
      />
    </div>
  );
}

// Story Start Modal with MC Selection
export interface StoryStartModalProps {
  story: {
    id: string;
    title: string;
    synopsis?: string | null;
    hasMcSlot: boolean;
    discoveryMode: boolean;
  };
  mcProfiles: McProfile[];
  userCharacters: CharacterAsMcOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (options: { 
    mcProfileId?: string | null; 
    characterId?: string | null;
    mode: 'use-mc-profile' | 'use-character' | 'anonymous' 
  }) => Promise<void>;
  onCreateMcProfile: (data: McProfileFormData) => Promise<McProfile>;
}

export function StoryStartModal({
  story,
  mcProfiles,
  userCharacters,
  open,
  onOpenChange,
  onStart,
  onCreateMcProfile,
}: StoryStartModalProps) {
  const t = useTranslations('mc.selector');
  const commonT = useTranslations('common');
  const { toast } = useToast();
  
  // Default to first mc profile if available
  const defaultProfile = mcProfiles.find(p => p.isDefault);
  const [selectedId, setSelectedId] = useState<string | null>(defaultProfile?.id ?? null);
  const [selectedType, setSelectedType] = useState<'profile' | 'character' | 'anonymous'>(
    defaultProfile ? 'profile' : 'anonymous'
  );
  const [isLoading, setIsLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const handleSelect = (id: string | null, type: 'profile' | 'character' | 'anonymous') => {
    setSelectedId(id);
    setSelectedType(type);
  };

  const handleStart = async () => {
    setIsLoading(true);
    try {
      await onStart({
        mcProfileId: selectedType === 'profile' ? selectedId : null,
        characterId: selectedType === 'character' ? selectedId : null,
        mode: selectedType === 'profile' ? 'use-mc-profile' 
           : selectedType === 'character' ? 'use-character' 
           : 'anonymous',
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: t('startFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAndStart = async (data: McProfileFormData) => {
    setIsLoading(true);
    try {
      const newProfile = await onCreateMcProfile(data);
      await onStart({
        mcProfileId: newProfile.id,
        mode: 'use-mc-profile',
      });
      setEditorOpen(false);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: t('createFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] flex flex-col p-0 overflow-hidden border-border/40 bg-background neigo-breathe-slow">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="w-5 h-5 text-amber-500" />
            {t('startStory')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {story.title}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 ohscroll">
          {story.hasMcSlot ? (
            <McProfileSelector
              profiles={mcProfiles}
              characters={userCharacters}
              selectedId={selectedId}
              selectedType={selectedType}
              onSelect={handleSelect}
              onCreate={onCreateMcProfile}
              onSetDefault={async (_id: string) => {}}
              onDelete={async (_id: string) => {}}
            />
          ) : (
            <div className="p-8 rounded-2xl bg-muted/30 border border-dashed border-border/40 text-center">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm text-muted-foreground">
                Cerita ini tidak memerlukan MC khusus
              </p>
            </div>
          )}

          {story.discoveryMode && (
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Star className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-amber-200">Mode Penjelajahan</div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Temukan semua pemeran dalam cerita ini dan buka rahasia mereka.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-6 pt-2 bg-muted/20 border-t border-border/10">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-muted/40">
            {commonT('cancel')}
          </Button>
          <Button 
            onClick={handleStart}
            disabled={isLoading}
            className="bg-amber-500 hover:bg-amber-600 text-black font-semibold px-6 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
          >
            {isLoading ? commonT('loading') : t('startAction')}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </DialogFooter>

        <McProfileEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          onSave={handleCreateAndStart}
          mode="create"
        />
      </DialogContent>
    </Dialog>
  );
}
