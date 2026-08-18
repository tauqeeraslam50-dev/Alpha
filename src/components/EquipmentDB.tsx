import React from 'react';
import { useAppContext } from '../context/AppContext';
import { Database as DBIcon, Plus, Search } from 'lucide-react';

export function EquipmentDB() {
  const { equipmentDB } = useAppContext();

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-800 flex items-center">
          <DBIcon className="w-6 h-6 mr-3 text-blue-600" />
          Engineering Database
        </h2>
        
        <button className="flex items-center px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded shadow-sm transition">
          <Plus className="w-4 h-4 mr-2" />
          Add Equipment
        </button>
      </div>

      <div className="mb-6 flex gap-4">
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input 
            type="text" 
            className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md leading-5 bg-white shadow-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition duration-150 ease-in-out" 
            placeholder="Search equipment..."
          />
        </div>
      </div>

      <div className="bg-white border border-slate-300 shadow-sm rounded-xl overflow-hidden flex-1 flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Manufacturer / Model</th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Band / Freq</th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">TX Power</th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">RX Sens.</th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Spacing</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {equipmentDB.map((eq) => (
                <tr key={eq.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-bold text-slate-800">{eq.manufacturer}</div>
                    <div className="text-xs text-slate-500">{eq.model}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-700">
                      <span className={`px-2 inline-flex text-[10px] font-bold uppercase tracking-widest rounded mr-2 border shadow-sm ${
                        eq.band === 'VHF' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        eq.band === 'Microwave' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-indigo-50 text-indigo-700 border-indigo-200'
                      }`}>
                        {eq.band}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 font-mono">{eq.frequencyRange} MHz</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-mono font-medium">
                    {eq.txPowerDBm} dBm
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-mono font-medium">
                    {eq.rxSensitivityDBm} dBm
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                    {eq.channelSpacingKHz} kHz
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
