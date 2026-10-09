import { createContext, useContext, useLayoutEffect, useState } from 'react';

// Lets the current page's <PageHeader> put its title into the mobile app bar.
const AppBarContext = createContext({ title: null, setTitle: () => {} });

export const AppBarProvider = ({ children }) => {
  const [title, setTitle] = useState(null);
  return <AppBarContext.Provider value={{ title, setTitle }}>{children}</AppBarContext.Provider>;
};

export const useAppBarTitle = () => useContext(AppBarContext).title;

// Called by PageHeader; clears the title again when the page unmounts.
export const useSetAppBarTitle = (title) => {
  const { setTitle } = useContext(AppBarContext);
  useLayoutEffect(() => {
    setTitle(title);
    return () => setTitle(null);
  }, [title, setTitle]);
};
