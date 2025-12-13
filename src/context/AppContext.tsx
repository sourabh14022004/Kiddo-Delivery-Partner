import React, { createContext, useContext, ReactNode } from 'react';
import { PickerDetails } from '../screens/PickerDetailsScreen';

interface AppContextType {
  phoneNumber: string;
  pickerDetails: PickerDetails | null;
  onLogout: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{
  children: ReactNode;
  phoneNumber: string;
  pickerDetails: PickerDetails | null;
  onLogout: () => void;
}> = ({ children, phoneNumber, pickerDetails, onLogout }) => {
  return (
    <AppContext.Provider value={{ phoneNumber, pickerDetails, onLogout }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};

