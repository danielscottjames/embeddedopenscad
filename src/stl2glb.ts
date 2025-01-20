/**
 * Minimal example of converting a **binary** STL file (in a Uint8Array)
 * to a GLB file (returned as a new Uint8Array).
 *
 * No third-party libraries are used.
 */
export function stl2glb(input: Uint8Array): Uint8Array {
  // -- 1) Parse the binary STL --

  if (input.byteLength < 84) {
    throw new Error("STL file too short or invalid.");
  }

  const dataView = new DataView(input.buffer, input.byteOffset, input.byteLength);

  // Read number of triangles
  const numTriangles = dataView.getUint32(80, true);
  const expectedSize = 84 + numTriangles * 50;
  if (input.byteLength < expectedSize) {
    throw new Error("STL file size does not match number of triangles.");
  }

  // Allocate arrays for positions and normals
  const totalVertices = numTriangles * 3;
  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  let offset = 84; // start of triangle data

  for (let t = 0; t < numTriangles; t++) {
    // Read the normal vector (3 floats)
    const nx = dataView.getFloat32(offset + 0, true);
    const ny = dataView.getFloat32(offset + 4, true);
    const nz = dataView.getFloat32(offset + 8, true);

    // Read the 3 vertices (each 3 floats)
    const v1x = dataView.getFloat32(offset + 12, true);
    const v1y = dataView.getFloat32(offset + 16, true);
    const v1z = dataView.getFloat32(offset + 20, true);

    const v2x = dataView.getFloat32(offset + 24, true);
    const v2y = dataView.getFloat32(offset + 28, true);
    const v2z = dataView.getFloat32(offset + 32, true);

    const v3x = dataView.getFloat32(offset + 36, true);
    const v3y = dataView.getFloat32(offset + 40, true);
    const v3z = dataView.getFloat32(offset + 44, true);

    // Update bounding box
    minX = Math.min(minX, v1x, v2x, v3x);
    minY = Math.min(minY, v1y, v2y, v3y);
    minZ = Math.min(minZ, v1z, v2z, v3z);

    maxX = Math.max(maxX, v1x, v2x, v3x);
    maxY = Math.max(maxY, v1y, v2y, v3y);
    maxZ = Math.max(maxZ, v1z, v2z, v3z);

    // Write positions
    const baseIndex = t * 9;
    positions[baseIndex + 0] = v1x;
    positions[baseIndex + 1] = v1y;
    positions[baseIndex + 2] = v1z;

    positions[baseIndex + 3] = v2x;
    positions[baseIndex + 4] = v2y;
    positions[baseIndex + 5] = v2z;

    positions[baseIndex + 6] = v3x;
    positions[baseIndex + 7] = v3y;
    positions[baseIndex + 8] = v3z;

    // Write normals (repeat the normal for each of the 3 vertices)
    normals[baseIndex + 0] = nx;
    normals[baseIndex + 1] = ny;
    normals[baseIndex + 2] = nz;

    normals[baseIndex + 3] = nx;
    normals[baseIndex + 4] = ny;
    normals[baseIndex + 5] = nz;

    normals[baseIndex + 6] = nx;
    normals[baseIndex + 7] = ny;
    normals[baseIndex + 8] = nz;

    // Advance offset
    offset += 50;
  }

  // -- 2) Build minimal glTF JSON --

  // Single mesh, single primitive, positions & normals only, no indices
  const gltf: any = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: {
              POSITION: 0,
              NORMAL: 1
            }
          }
        ]
      }
    ],
    buffers: [
      {
        // We'll fill byteLength later
        byteLength: 0
      }
    ],
    bufferViews: [
      {
        // POSITION
        buffer: 0,
        byteOffset: 0,
        byteLength: 0
      },
      {
        // NORMAL
        buffer: 0,
        byteOffset: 0,
        byteLength: 0
      }
    ],
    accessors: [
      {
        // POSITION
        bufferView: 0,
        componentType: 5126, // FLOAT
        count: totalVertices,
        type: "VEC3",
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ]
      },
      {
        // NORMAL
        bufferView: 1,
        componentType: 5126,
        count: totalVertices,
        type: "VEC3"
      }
    ]
  };

  // -- 3) Create the binary buffer (positions + normals) --
  const positionBytes = positions.byteLength;
  const normalBytes = normals.byteLength;
  const totalBufferByteLength = positionBytes + normalBytes;

  // Combine positions + normals into one buffer
  const combinedBuffer = new ArrayBuffer(totalBufferByteLength);
  const combinedView = new Uint8Array(combinedBuffer);

  // Copy with attention to typed array offsets
  combinedView.set(
    new Uint8Array(positions.buffer, positions.byteOffset, positionBytes),
    0
  );
  combinedView.set(
    new Uint8Array(normals.buffer, normals.byteOffset, normalBytes),
    positionBytes
  );

  // Fill bufferViews info
  gltf.bufferViews[0].byteOffset = 0;
  gltf.bufferViews[0].byteLength = positionBytes;
  gltf.bufferViews[1].byteOffset = positionBytes;
  gltf.bufferViews[1].byteLength = normalBytes;

  // Fill buffers info
  gltf.buffers[0].byteLength = totalBufferByteLength;

  // -- 4) Convert glTF JSON to string and **pad** with ASCII spaces --

  const textEncoder = new TextEncoder();
  let gltfJsonString = JSON.stringify(gltf);
  let jsonBuffer = textEncoder.encode(gltfJsonString);

  // GLB requires each chunk to be 4-byte aligned.
  // Use ASCII space (0x20) for padding, rather than 0x00.
  const remainder = jsonBuffer.byteLength % 4;
  if (remainder !== 0) {
    const jsonPad = 4 - remainder;
    const padding = new Uint8Array(jsonPad).fill(0x20); // fill with spaces (0x20)
    jsonBuffer = Uint8Array.of(...jsonBuffer, ...padding);
  }

  // -- 5) Build the final GLB (header + JSON chunk + BIN chunk) --

  // GLB Header (12 bytes):
  //   [0..3]   magic = 'glTF' (0x46546C67 in little endian)
  //   [4..7]   version = 2
  //   [8..11]  totalLength = 12 + (8 + JSON length) + (8 + BIN length)
  const GLB_HEADER_BYTES = 12;
  // Each chunk has an 8-byte header: (4 bytes length, 4 bytes type)
  const CHUNK_HEADER_BYTES = 8;

  const jsonChunkLength = jsonBuffer.byteLength;
  const binChunkLength = combinedView.byteLength;

  const totalLength =
    GLB_HEADER_BYTES +
    CHUNK_HEADER_BYTES +
    jsonChunkLength +
    CHUNK_HEADER_BYTES +
    binChunkLength;

  // Create output buffer
  const glbBuffer = new ArrayBuffer(totalLength);
  const glbView = new DataView(glbBuffer);
  let glbOffset = 0;

  // [1] Write GLB header
  glbView.setUint32(glbOffset, 0x46546c67, true); // magic 'glTF'
  glbOffset += 4;
  glbView.setUint32(glbOffset, 2, true); // version = 2
  glbOffset += 4;
  glbView.setUint32(glbOffset, totalLength, true); // total length
  glbOffset += 4;

  // [2] Write JSON chunk header
  glbView.setUint32(glbOffset, jsonChunkLength, true); // chunk length
  glbOffset += 4;
  glbView.setUint32(glbOffset, 0x4e4f534a, true); // type = 'JSON' (0x4E4F534A)
  glbOffset += 4;

  // [3] Write JSON chunk data
  new Uint8Array(glbBuffer, glbOffset, jsonChunkLength).set(jsonBuffer);
  glbOffset += jsonChunkLength;

  // [4] Write BIN chunk header
  glbView.setUint32(glbOffset, binChunkLength, true);
  glbOffset += 4;
  glbView.setUint32(glbOffset, 0x004e4942, true); // type = 'BIN' (0x004E4942)
  glbOffset += 4;

  // [5] Write BIN chunk data
  new Uint8Array(glbBuffer, glbOffset, binChunkLength).set(combinedView);
  glbOffset += binChunkLength;

  // Return the GLB as a Uint8Array
  return new Uint8Array(glbBuffer);
}
