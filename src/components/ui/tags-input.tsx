import * as React from "react";
import { X } from "lucide-react";
import { cn } from "~/lib/utils";
import { Badge } from "./badge";
import { Button } from "./button";

interface TagsInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function TagsInput({
  value,
  onChange,
  placeholder = "Add tags...",
  className,
}: TagsInputProps) {
  const [inputValue, setInputValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  const addTag = () => {
    const trimmedValue = inputValue.trim();
    if (trimmedValue && !value.includes(trimmedValue)) {
      onChange([...value, trimmedValue]);
      setInputValue("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex min-h-9 w-full flex-wrap gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1.5 text-sm">
            <span>{tag}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-4 w-4 text-muted-foreground hover:text-foreground"
              onClick={() => removeTag(tag)}
            >
              <X className="h-3 w-3" />
              <span className="sr-only">Remove {tag}</span>
            </Button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onBlur={addTag}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 border-0 bg-transparent px-0 py-1 text-sm outline-none placeholder:text-muted-foreground min-w-[120px]"
        />
      </div>
    </div>
  );
}
