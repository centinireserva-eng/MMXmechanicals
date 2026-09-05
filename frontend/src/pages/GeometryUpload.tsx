import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle } from 'lucide-react';
import FileUploader from '../components/FileUploader';

export default function GeometryUpload() {
  const { t } = useTranslation();
  const [showHelp, setShowHelp] = useState(false);
  return (
    <div className="upload-page">
      <div className="upload-page__header">
        <div>
          <h1>{t('geometry.title')}</h1>
          <p>{t('geometry.subtitle')}</p>
        </div>
        <div className="relative">
          <button onClick={() => setShowHelp(v => !v)} className="btn-ghost"><HelpCircle size={16} /> {t('geometry.help')}</button>
          {showHelp && (
            <div className="upload-help" role="status">
              <p>STL, OBJ e STEP são processados como geometrias 3D; DXF como desenho 2D.</p>
              <p>A voxelização converte a peça em uma grade para o solver LBM, preservando suas proporções.</p>
            </div>
          )}
        </div>
      </div>
      <FileUploader />
    </div>
  );
}
