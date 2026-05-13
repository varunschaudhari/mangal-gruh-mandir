import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, KeyRound, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_LABELS } from '../../utils/permissions.js';
import toast from 'react-hot-toast';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    navigate('/login');
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-white px-6">
      <div />
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-xs font-bold">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="text-left">
            <p className="font-medium leading-tight">{user?.name}</p>
            <p className="text-xs text-gray-400">{ROLE_LABELS[user?.role]}</p>
          </div>
          <ChevronDown className="h-3 w-3 text-gray-400" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg bg-white shadow-lg border border-gray-100 py-1">
              <button
                onClick={() => { setOpen(false); navigate('/profile'); }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <User className="h-4 w-4" /> My Profile
              </button>
              <button
                onClick={() => { setOpen(false); navigate('/change-password'); }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <KeyRound className="h-4 w-4" /> Change Password
              </button>
              <hr className="my-1" />
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" /> Logout
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
};

export default Navbar;
