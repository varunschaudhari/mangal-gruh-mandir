import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Navbar from './Navbar.jsx';

const AppLayout = () => (
  <div className="flex h-screen overflow-hidden bg-gray-50">
    <Sidebar />
    <div className="flex flex-1 flex-col overflow-hidden">
      <Navbar />
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  </div>
);

export default AppLayout;
