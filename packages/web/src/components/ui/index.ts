/**
 * Barrel export for Project Neigo UI primitives.
 *
 * Import from a single place so swaps (bespoke → Radix/Vaul/Sonner in a
 * follow-up commit) land without editing call sites.
 *
 * Wk4 pre-flight — see FRONTEND.md §7 + §17.1.
 */

export { Sheet } from './Sheet';
export type { SheetProps } from './Sheet';

export { ToastProvider, useToast } from './Toast';
export type { ToastVariant, ToastInput } from './Toast';

export { Skeleton, SkeletonText } from './Skeleton';
export { Chip } from './Chip';
export type { ChipProps, ChipVariant, ChipSize } from './Chip';
export { IconButton } from './IconButton';
export type { IconButtonProps, IconButtonSize, IconButtonVariant } from './IconButton';
export { EmptyState } from './EmptyState';
export { Banner } from './Banner';
export type { BannerTone } from './Banner';
export { AuroraSkeleton, PosterSkeleton } from './AuroraSkeleton';
export { Button } from './button';
export type { ButtonProps } from './button';
export { Card, CardHeader, CardTitle, CardContent, CardDescription } from './card';
export { Badge } from './badge';
export type { BadgeProps } from './badge';
export { Avatar, AvatarImage, AvatarFallback } from './avatar';
export { Progress } from './progress';
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './tooltip';
export { Input } from './input';
export type { InputProps } from './input';
export { Textarea } from './textarea';
export type { TextareaProps } from './textarea';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';
export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from './dialog';
export { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from './form';
