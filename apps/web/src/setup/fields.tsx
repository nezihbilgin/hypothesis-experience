// Setup screen form fields: thin wrappers over the Untitled UI React components (src/uui), so the editors read
// like plain forms. Every field has a visible label or an aria-label (table cells), for screen readers.
import type { ReactNode } from 'react'
import { FileTrigger } from 'react-aria-components'
import { Button } from '@/components/base/buttons/button'
import { Checkbox } from '@/components/base/checkbox/checkbox'
import { Input } from '@/components/base/input/input'
import { NativeSelect } from '@/components/base/select/select-native'
import { TextArea } from '@/components/base/textarea/textarea'
import { cx } from '@/utils/cx'

export function Field({ label, hideLabel, value, onChange, placeholder, className, type }: { label: string; hideLabel?: boolean; value: string; onChange: (v: string) => void; placeholder?: string; className?: string; type?: 'text' | 'number' }) {
  return <Input size="sm" type={type} label={hideLabel ? undefined : label} aria-label={hideLabel ? label : undefined} value={value} onChange={onChange} placeholder={placeholder} className={className} />
}

export function NumField({ label, value, onChange, placeholder, min, max }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string; min?: number; max?: number }) {
  return (
    <input
      type="number"
      aria-label={label}
      title={label}
      min={min}
      max={max}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0)}
      className="w-18 rounded-lg bg-primary px-2.5 py-2 text-sm text-primary shadow-xs ring-1 ring-primary outline-hidden ring-inset focus:ring-2 focus:ring-brand"
    />
  )
}

export function Area({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return <TextArea size="sm" label={label} value={value} onChange={onChange} rows={rows} />
}

export function Select({ label, hideLabel, value, onChange, options, className }: { label: string; hideLabel?: boolean; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return <NativeSelect size="sm" label={hideLabel ? undefined : label} aria-label={hideLabel ? label : undefined} value={value} onChange={(e) => onChange(e.target.value)} options={options} className={cx('w-auto min-w-40', className)} />
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <Checkbox size="sm" label={label} isSelected={checked} onChange={onChange} />
}

export function Btn({ children, onPress, color = 'secondary', isDisabled, size = 'sm' }: { children: ReactNode; onPress: () => void; color?: 'primary' | 'secondary' | 'tertiary' | 'link-gray' | 'link-destructive'; isDisabled?: boolean; size?: 'sm' | 'md' }) {
  return (
    <Button size={size} color={color} onPress={onPress} isDisabled={isDisabled}>
      {children}
    </Button>
  )
}

/** Opens one JSON file (accessible file button; nothing is uploaded). */
export function FilePick({ label, onFile }: { label: string; onFile: (f: File) => void }) {
  return (
    <FileTrigger acceptedFileTypes={['application/json', '.json']} onSelect={(files) => files?.[0] && onFile(files[0])}>
      <Button size="sm" color="secondary">
        {label}
      </Button>
    </FileTrigger>
  )
}
