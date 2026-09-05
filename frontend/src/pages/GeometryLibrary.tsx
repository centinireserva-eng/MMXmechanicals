import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Box, Building2, CarFront, ChevronLeft, ChevronRight, Circle, CircleDot, Columns3, CornerDownRight, Cuboid, Cylinder, Disc, DoorOpen, Factory, GitFork, Grid3x3, Layers, Rows3, Search, SlidersHorizontal, Sparkles, Star } from 'lucide-react';
import GeometryPreview from '../components/GeometryPreview';
import { GEOMETRY_PRESETS } from '../data/geometryPresets';

const ICONS = {
  cylinder: Circle, duct: Cuboid, sphere: Circle, elbow: CornerDownRight, ahmed: CarFront, cavity: Box,
  channel: Rows3, tube: CircleDot, step: Layers,
  tjunction: GitFork, valve: Disc, building: Building2, room: DoorOpen, coolingtower: Factory,
  tubebank: Columns3, screen: Grid3x3, tank: Cylinder,
  upload: Box, voxel: Box,
};

const CATEGORIES = ['Todas', 'Internos', 'Externos', 'Industriais', 'Validação'];
const SORTS = { recent: 'Mais recentes', name: 'Nome A–Z', reynolds: 'Maior Reynolds' };
const PER_PAGE = 6;
const FAVORITES_KEY = 'mmx_favorite_geometries';

function loadFavorites() {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'));
  } catch {
    return new Set<string>();
  }
}

export default function GeometryLibrary() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [dim, setDim] = useState('Todos');
  const [cat, setCat] = useState('Todas');
  const [sort, setSort] = useState<keyof typeof SORTS>('recent');
  const [page, setPage] = useState(1);
  const [favorites, setFavorites] = useState(loadFavorites);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); }, [favorites]);
  useEffect(() => { setPage(1); }, [search, dim, cat, sort]);

  const toggleFavorite = (event: React.MouseEvent, id: string) => {
    event.stopPropagation();
    setFavorites((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = useMemo(() => {
    const query = normalize(search);
    let list = GEOMETRY_PRESETS.filter((geometry) =>
      (!query || normalize(`${geometry.name} ${geometry.category} ${geometry.dimension} ${geometry.turbulence}`).includes(query)) &&
      (dim === 'Todos' || geometry.dimension === dim) &&
      (cat === 'Todas' || geometry.category === cat)
    );
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'reynolds') list = [...list].sort((a, b) => b.reynolds - a.reynolds);
    if (sort === 'recent') list = [...list].sort((a, b) => b.added - a.added);
    return list;
  }, [search, dim, cat, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageItems = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="library-page">
      <header className="library-header">
        <div>
          <h1>Biblioteca de Geometrias</h1>
          <p>Modelos preparados para configurar e executar.</p>
        </div>
        <label className="library-search">
          <Search size={17} />
          <span className="sr-only">Buscar geometrias</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar geometria, física, aplicação…" />
          <kbd>⌘ K</kbd>
        </label>
        <div className="dimension-control" aria-label="Filtrar por dimensão">
          <span>Dimensão</span>
          {['Todos', '2D', '3D'].map((value) => (
            <button key={value} type="button" aria-pressed={dim === value} onClick={() => setDim(value)}>{value}</button>
          ))}
        </div>
      </header>

      <div className="library-toolbar">
        <div className="category-control" aria-label="Filtrar por categoria">
          {CATEGORIES.map((value) => (
            <button key={value} type="button" aria-pressed={cat === value} onClick={() => setCat(value)}>{value}</button>
          ))}
        </div>
        <label className="sort-control"><SlidersHorizontal size={15} /><span className="sr-only">Ordenar</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as keyof typeof SORTS)}>
            {Object.entries(SORTS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      </div>

      {pageItems.length === 0 ? (
        <div className="library-empty">
          <Search size={24} />
          <strong>Nenhuma geometria encontrada</strong>
          <p>Tente outro termo ou remova um dos filtros.</p>
          <button type="button" onClick={() => { setSearch(''); setDim('Todos'); setCat('Todas'); }}>Limpar filtros</button>
        </div>
      ) : (
        <div className="geometry-grid">
          {pageItems.map((geometry) => {
            const Icon = ICONS[geometry.kind];
            const isFavorite = favorites.has(geometry.id);
            return (
              <article
                key={geometry.id}
                className="geometry-card"
                onMouseEnter={() => setHovered(geometry.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <button className="geometry-card__open" type="button" onClick={() => navigate(`/simulation/new?geo=${geometry.id}`)} aria-label={`Usar ${geometry.name}`}>
                  <GeometryPreview kind={geometry.kind} active={hovered === geometry.id} />
                  <span className="geometry-card__dimension">{geometry.dimension}</span>
                  <span className="geometry-card__view"><ArrowUpRight size={15} /> Usar modelo</span>
                </button>
                <button type="button" className="geometry-favorite" onClick={(event) => toggleFavorite(event, geometry.id)} aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} aria-pressed={isFavorite}>
                  <Star size={16} fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
                <div className="geometry-card__content">
                  <div className="geometry-card__title">
                    <span><Icon size={16} /></span>
                    <div><h2>{geometry.name}</h2><p>{geometry.category}</p></div>
                    {geometry.id === 'ahmed-body' && <Sparkles size={15} className="ml-auto text-mmx-accent" aria-label="Destaque" />}
                  </div>
                  <div className="geometry-tags">
                    <span className={`difficulty difficulty--${geometry.difficulty.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}`}>{geometry.difficulty}</span>
                    <span>LBM D3Q19</span><span>{geometry.turbulence}</span><span>{geometry.thermal ? 'Térmico' : 'Isotérmico'}</span>
                  </div>
                  <div className="geometry-card__proof"><span>Reynolds</span><strong>{geometry.reynolds.toLocaleString('pt-BR')}</strong><span>Prévia WebGL</span></div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <footer className="library-footer">
        <span>Mostrando {filtered.length === 0 ? 0 : (page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} de {filtered.length} geometrias</span>
        <div>
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} aria-label="Página anterior"><ChevronLeft size={15} /></button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((value) => <button key={value} type="button" aria-current={value === page ? 'page' : undefined} onClick={() => setPage(value)}>{value}</button>)}
          <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages} aria-label="Próxima página"><ChevronRight size={15} /></button>
        </div>
        <span>{PER_PAGE} por página</span>
      </footer>
    </div>
  );
}
