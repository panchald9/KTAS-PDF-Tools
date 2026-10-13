import ToolHub from './tool-hub';

export default function Catalog({ home = false, section = 'pdf' }: { home?: boolean; section?: 'all' | 'pdf' | 'image' | 'text' | 'word' | 'excel' }) {
  return <ToolHub home={home} scope={home ? 'all' : section} />;
}