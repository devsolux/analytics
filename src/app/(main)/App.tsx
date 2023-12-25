'use client';
import { Loading } from 'react-basics';
import { usePathname } from 'next/navigation';
import { useLogin, useConfig } from 'components/hooks';

export function App({ children }) {
  const { user, isLoading, error } = useLogin();
  const config = useConfig();
  const pathname = usePathname();

  if (isLoading) {
    return <Loading />;
  }

  if (error) {
    window.location.href = `${process.env.basePath || ''}/login`;
  }

  if (!user || !config) {
    return null;
  }

  return (
    <>
      {children}
    </>
  );
}

export default App;
