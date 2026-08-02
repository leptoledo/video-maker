import JSZip from 'jszip';
import refCapCut from './ref-capcut.json';

export interface SceneImage {
  name: string;
  timestamp: number; // in seconds
  file: File;
}

function newUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().toUpperCase();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

function toUS(seconds: number): number {
  return Math.round(seconds * 1_000_000);
}

export async function generateCapCutZip(
  projectName: string,
  audioFile: File,
  audioDurationSec: number,
  images: SceneImage[],
  aspectRatio: { width: number; height: number } = { width: 1920, height: 1080 }
): Promise<Blob> {
  const zip = new JSZip();
  const folderName = projectName.replace(/[/\\:]/g, '_');
  const projectFolder = zip.folder(folderName);
  if (!projectFolder) throw new Error('Could not create project folder in zip');

  const draftId = newUUID();
  const audioDurationUS = toUS(audioDurationSec);
  const nowUS = Date.now() * 1000;

  // Add audio file to zip inside project folder
  const audioFileName = audioFile.name;
  projectFolder.file(audioFileName, audioFile);

  // Group images by timestamp
  const sortedImages = [...images].sort((a, b) => a.timestamp - b.timestamp);

  const materials: any = {
    videos: [],
    audios: [],
    speeds: [],
    placeholder_infos: [],
    canvases: [],
    material_animations: [],
    sound_channel_mappings: [],
    material_colors: [],
    vocal_separations: [],
    beats: [],
  };

  const auxVideoOrder = [
    'speeds',
    'placeholder_infos',
    'canvases',
    'material_animations',
    'sound_channel_mappings',
    'material_colors',
    'vocal_separations',
  ];
  const auxAudioOrder = [
    'speeds',
    'placeholder_infos',
    'beats',
    'sound_channel_mappings',
    'vocal_separations',
  ];

  const segsVideo: any[] = [];
  let currentOffset = 0;

  // Group by timestamp seconds
  const groupedMap = new Map<number, SceneImage[]>();
  sortedImages.forEach((img) => {
    const list = groupedMap.get(img.timestamp) || [];
    list.push(img);
    groupedMap.set(img.timestamp, list);
  });

  const timestamps = Array.from(groupedMap.keys()).sort((a, b) => a - b);

  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const groupImages = groupedMap.get(ts)!;
    const nextTs = i + 1 < timestamps.length ? timestamps[i + 1] : audioDurationSec;
    const groupDurationUS = Math.max(toUS(nextTs) - toUS(ts), 100_000);
    const n = groupImages.length;
    const baseDur = Math.floor(groupDurationUS / n);

    for (let k = 0; k < n; k++) {
      const img = groupImages[k];
      const durUS = k < n - 1 ? baseDur : groupDurationUS - baseDur * (n - 1);

      // Add image file to zip folder
      projectFolder.file(img.name, img.file);

      // Clone material photo
      const mphoto = JSON.parse(JSON.stringify(refCapCut.material_photo));
      mphoto.id = newUUID();
      mphoto.path = img.name;
      mphoto.material_name = img.name;
      mphoto.width = aspectRatio.width;
      mphoto.height = aspectRatio.height;
      materials.videos.push(mphoto);

      // Clone video auxiliary materials
      const refs: string[] = [];
      auxVideoOrder.forEach((key) => {
        const aux = JSON.parse(JSON.stringify((refCapCut.aux_video as any)[key]));
        aux.id = newUUID();
        materials[key].push(aux);
        refs.push(aux.id);
      });

      // Clone video segment
      const seg = JSON.parse(JSON.stringify(refCapCut.segmento_video));
      seg.id = newUUID();
      seg.material_id = mphoto.id;
      seg.source_timerange = { start: 0, duration: durUS };
      seg.target_timerange = { start: currentOffset, duration: durUS };
      seg.extra_material_refs = refs;
      segsVideo.push(seg);

      currentOffset += durUS;
    }
  }

  // Audio material
  const maudio = JSON.parse(JSON.stringify(refCapCut.material_audio));
  maudio.id = newUUID();
  maudio.path = audioFileName;
  maudio.name = audioFileName;
  maudio.duration = audioDurationUS;
  materials.audios.push(maudio);

  const refsAudio: string[] = [];
  auxAudioOrder.forEach((key) => {
    const aux = JSON.parse(JSON.stringify((refCapCut.aux_audio as any)[key]));
    aux.id = newUUID();
    if (!materials[key]) materials[key] = [];
    materials[key].push(aux);
    refsAudio.push(aux.id);
  });

  const segAudio = JSON.parse(JSON.stringify(refCapCut.segmento_audio));
  segAudio.id = newUUID();
  segAudio.material_id = maudio.id;
  segAudio.source_timerange = { start: 0, duration: audioDurationUS };
  segAudio.target_timerange = { start: 0, duration: audioDurationUS };
  segAudio.extra_material_refs = refsAudio;

  const draftInfo = {
    canvas_config: {
      ratio: 'original',
      width: aspectRatio.width,
      height: aspectRatio.height,
      background: null,
    },
    duration: Math.max(currentOffset, audioDurationUS),
    fps: 30.0,
    id: draftId,
    materials,
    name: projectName,
    new_version: '100.0.0',
    tracks: [
      {
        attribute: 0,
        flag: 0,
        id: newUUID(),
        is_default_name: true,
        name: '',
        segments: segsVideo,
        type: 'video',
      },
      {
        attribute: 0,
        flag: 0,
        id: newUUID(),
        is_default_name: true,
        name: '',
        segments: [segAudio],
        type: 'audio',
      },
    ],
  };

  const draftMetaInfo = {
    draft_id: draftId,
    draft_name: projectName,
    draft_fold_path: '',
    draft_cover: '',
    draft_type: '',
    tm_draft_create: nowUS,
    tm_draft_modified: nowUS,
    draft_duration: Math.max(currentOffset, audioDurationUS),
  };

  // Add metadata JSON files into project folder
  projectFolder.file('draft_info.json', JSON.stringify(draftInfo, null, 2));
  projectFolder.file('draft_content.json', JSON.stringify(draftInfo, null, 2));
  projectFolder.file('draft_meta_info.json', JSON.stringify(draftMetaInfo, null, 2));

  return await zip.generateAsync({ type: 'blob' });
}
