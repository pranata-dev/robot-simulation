import * as THREE from 'three';

function disposeMaterialTextures(material: THREE.Material): void {
  const materialRecord = material as unknown as Record<string, unknown>;
  for (const value of Object.values(materialRecord)) {
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }
  material.dispose();
}

export function disposeSceneResources(scene: THREE.Scene): void {
  if (scene.background instanceof THREE.Texture) {
    scene.background.dispose();
  }
  if (scene.environment instanceof THREE.Texture) {
    scene.environment.dispose();
  }
  scene.traverse((object) => {
    const meshLike = object as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    if (meshLike.geometry instanceof THREE.BufferGeometry) {
      meshLike.geometry.dispose();
    }
    if (Array.isArray(meshLike.material)) {
      for (const material of meshLike.material) {
        disposeMaterialTextures(material);
      }
    } else if (meshLike.material instanceof THREE.Material) {
      disposeMaterialTextures(meshLike.material);
    }
  });
}

