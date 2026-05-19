/**
 * MC Profile Editor Component
 * For creating and editing MC (Main Character) profiles
 */

'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  User, 
  Save, 
  Trash2, 
  Sparkles
} from 'lucide-react';

export interface McProfile {
  id: string;
  name: string;
  avatarUrl: string | null;
  persona: {
    age?: number | null;
    gender?: string | null;
    personality: string;
    appearance?: string | null;
    background?: string | null;
    speechStyle?: string | null;
  };
  isDefault: boolean;
}

export interface McProfileEditorProps {
  profile?: McProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: McProfileFormData) => Promise<void>;
  onDelete?: () => Promise<void>;
  mode?: 'create' | 'edit';
}

export interface McProfileFormData {
  name: string;
  avatarUrl?: string | null;
  persona: {
    age?: number | null;
    gender?: string | null;
    personality: string;
    appearance?: string | null;
    background?: string | null;
    speechStyle?: string | null;
  };
  isDefault: boolean;
}

export function McProfileEditor({
  profile,
  open,
  onOpenChange,
  onSave,
  onDelete,
  mode = 'create'
}: McProfileEditorProps) {
  const t = useTranslations('mc.editor');
  const commonT = useTranslations('common');
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');

  // Form state
  const [name, setName] = useState(profile?.name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? '');
  const [age, setAge] = useState<string>(profile?.persona?.age?.toString() ?? '');
  const [gender, setGender] = useState(profile?.persona?.gender ?? '');
  const [personality, setPersonality] = useState(profile?.persona?.personality ?? '');
  const [appearance, setAppearance] = useState(profile?.persona?.appearance ?? '');
  const [background, setBackground] = useState(profile?.persona?.background ?? '');
  const [speechStyle, setSpeechStyle] = useState(profile?.persona?.speechStyle ?? '');
  const [isDefault, setIsDefault] = useState(profile?.isDefault ?? false);

  // Update local state when profile prop changes
  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setAvatarUrl(profile.avatarUrl ?? '');
      setAge(profile.persona?.age?.toString() ?? '');
      setGender(profile.persona?.gender ?? '');
      setPersonality(profile.persona?.personality ?? '');
      setAppearance(profile.persona?.appearance ?? '');
      setBackground(profile.persona?.background ?? '');
      setSpeechStyle(profile.persona?.speechStyle ?? '');
      setIsDefault(profile.isDefault);
    }
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast({
        title: t('nameError'),
        variant: 'destructive',
      });
      return;
    }

    if (!personality.trim()) {
      toast({
        title: t('personalityError'),
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await onSave({
        name: name.trim(),
        avatarUrl: avatarUrl.trim() || null,
        persona: {
          age: age ? parseInt(age) : null,
          gender: gender.trim() || null,
          personality: personality.trim(),
          appearance: appearance.trim() || null,
          background: background.trim() || null,
          speechStyle: speechStyle.trim() || null,
        },
        isDefault,
      });

      toast({
        title: mode === 'create' ? t('createSuccess') : t('updateSuccess'),
        description: t('saveSuccess'),
      });

      onOpenChange(false);
    } catch (error) {
      toast({
        title: commonT('error'),
        description: t('saveFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    if (confirm(t('deleteConfirm'))) {
      setIsLoading(true);
      try {
        await onDelete();
        toast({
          title: t('deleteSuccess'),
        });
        onOpenChange(false);
      } catch (error) {
        toast({
          title: commonT('error'),
          description: t('saveFailed'),
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'create' ? (
              <>
                <Sparkles className="w-5 h-5 text-amber-500" />
                {t('createTitle')}
              </>
            ) : (
              <>
                <User className="w-5 h-5" />
                {t('editTitle')}
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {t('description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic Info Tab */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 pt-4">
              {/* Name */}
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  {t('nameLabel')} <span className="text-red-500">*</span>
                </label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('namePlaceholder')}
                  maxLength={100}
                />
              </div>

              {/* Avatar URL */}
              <div className="space-y-2">
                <label htmlFor="avatar" className="text-sm font-medium">
                  {t('avatarLabel')}
                </label>
                <Input
                  id="avatar"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder={t('avatarPlaceholder')}
                  type="url"
                />
                <p className="text-xs text-muted-foreground">
                  {t('avatarHint')}
                </p>
              </div>

              {/* Personality */}
              <div className="space-y-2">
                <label htmlFor="personality" className="text-sm font-medium">
                  {t('personalityLabel')} <span className="text-red-500">*</span>
                </label>
                <Textarea
                  id="personality"
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  placeholder={t('personalityPlaceholder')}
                  rows={4}
                  maxLength={2000}
                />
                <p className="text-xs text-muted-foreground">
                  {personality.length}/2000
                </p>
              </div>
            </TabsContent>

            <TabsContent value="appearance" className="space-y-4 pt-4">
              {/* Age */}
              <div className="space-y-2">
                <label htmlFor="age" className="text-sm font-medium">
                  Age
                </label>
                <Input
                  id="age"
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="25"
                  min={1}
                  max={999}
                />
              </div>

              {/* Gender */}
              <div className="space-y-2">
                <label htmlFor="gender" className="text-sm font-medium">
                  Gender
                </label>
                <Input
                  id="gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  placeholder="Male, Female, Non-binary, etc."
                  maxLength={50}
                />
              </div>

              {/* Appearance */}
              <div className="space-y-2">
                <label htmlFor="appearance" className="text-sm font-medium">
                  Appearance
                </label>
                <Textarea
                  id="appearance"
                  value={appearance}
                  onChange={(e) => setAppearance(e.target.value)}
                  placeholder="Describe MC's physical appearance..."
                  rows={4}
                  maxLength={2000}
                />
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4 pt-4">
              {/* Background */}
              <div className="space-y-2">
                <label htmlFor="background" className="text-sm font-medium">
                  Background / History
                </label>
                <Textarea
                  id="background"
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  placeholder="Describe MC's backstory..."
                  rows={4}
                  maxLength={2000}
                />
              </div>

              {/* Speech Style */}
              <div className="space-y-2">
                <label htmlFor="speechStyle" className="text-sm font-medium">
                  Speech Style
                </label>
                <Textarea
                  id="speechStyle"
                  value={speechStyle}
                  onChange={(e) => setSpeechStyle(e.target.value)}
                  placeholder="How does the MC talk? (e.g. Formal, slangy, polite)"
                  rows={3}
                  maxLength={1000}
                />
              </div>

              {/* Set as Default */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                />
                <label htmlFor="isDefault" className="text-sm font-medium cursor-pointer">
                  {t('defaultLabel')}
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('defaultHint')}
              </p>
            </TabsContent>
          </Tabs>

          <DialogFooter className="flex-row gap-2 sm:gap-2">
            {mode === 'edit' && onDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isLoading}
                className="flex-1 sm:flex-none"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {commonT('delete')}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {commonT('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              <Save className="w-4 h-4 mr-2" />
              {isLoading ? commonT('loading') : commonT('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Quick Create Button Component
interface QuickCreateButtonProps {
  onClick: () => void;
  className?: string;
}

export function QuickCreateMcButton({ onClick, className }: QuickCreateButtonProps) {
  const t = useTranslations('mc.selector');
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className={(
        'border-dashed border-2 border-amber-500/50 hover:border-amber-500 hover:bg-amber-500/10'
      )}
    >
      <Sparkles className="w-4 h-4 mr-2 text-amber-500" />
      {t('createLabel')}
    </Button>
  );
}
