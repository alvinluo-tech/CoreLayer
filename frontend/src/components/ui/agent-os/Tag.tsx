import { useState } from 'react';
import { X } from 'lucide-react';

interface TagProps {
  children: React.ReactNode;
  color: string;
  onRemove?: () => void;
}

export function Tag({ children, color, onRemove }: TagProps) {
  return (
    <span
      className="inline-flex items-center gap-1"
      style={{
        fontFamily: 'var(--font-data)',
        fontSize: 10,
        color,
        background: `${color}15`,
        padding: '2px 8px',
        borderRadius: 4,
        border: `1px solid ${color}25`,
      }}
    >
      {children}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-50 hover:opacity-100 transition-opacity"
          style={{ color, fontSize: 10, lineHeight: 1, cursor: 'pointer', display: 'flex' }}
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}

interface TagInputProps {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  color: string;
}

export function TagInput({ value, onChange, placeholder, color }: TagInputProps) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const tag = input.trim();
    if (tag && !value.includes(tag)) {
      onChange([...value, tag]);
    }
    setInput('');
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {value.map((tag) => (
          <Tag key={tag} color={color} onRemove={() => removeTag(tag)}>
            {tag}
          </Tag>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addTag();
          }
        }}
        onBlur={addTag}
        placeholder={placeholder}
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 11,
          color: 'var(--text-secondary)',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 6,
          padding: '4px 8px',
          width: '100%',
          outline: 'none',
        }}
      />
    </div>
  );
}
