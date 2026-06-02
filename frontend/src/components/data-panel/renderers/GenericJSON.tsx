import { useMemo } from 'react';

interface GenericJSONProps {
  data: unknown;
}

export function GenericJSON({ data }: GenericJSONProps) {
  const formatted = useMemo(() => {
    try {
      return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  return <pre className="dp-json-block">{formatted}</pre>;
}
