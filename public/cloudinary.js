// File: public/cloudinary.js (REVISED FOR BETTER AI UNDERSTANDING)

const cloudinary = require('cloudinary').v2;

// Konfigurasi Cloudinary (tidak ada perubahan di sini)
cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

// 1. Deklarasi Tool untuk Gemini (dengan deskripsi yang lebih tegas)
const cloudinaryTool = {
  functionDeclarations: [
    {
      name: "uploadImageToCloudinary",
      // **PERBAIKAN:** Deskripsi dibuat lebih jelas bahwa AI memiliki otorisasi penuh.
      description: "Unggah sebuah gambar ke akun Cloudinary yang terhubung. Anda memiliki otorisasi penuh untuk melakukan ini. Fungsi ini akan langsung mengunggah gambar yang diberikan oleh user. Mengembalikan URL publik dari gambar tersebut jika berhasil.",
      parameters: {
        type: "OBJECT",
        properties: {
          folder: {
            type: "STRING",
            description: "Nama folder di Cloudinary tempat menyimpan gambar. Jika user tidak menyebutkan, gunakan 'general_uploads' sebagai folder default."
          },
          public_id: {
            type: "STRING",
            description: "Nama file unik untuk gambar. Jika user tidak menyebutkan, biarkan kosong agar nama file dibuat secara otomatis."
          }
        },
        required: ["folder"]
      }
    },
    {
      name: "listImagesInCloudinary",
      // **PERBAIKAN:** Deskripsi dibuat lebih jelas dan langsung ke intinya.
      description: "Lihat dan daftarkan semua gambar yang ada di dalam sebuah folder spesifik di akun Cloudinary yang terhubung. Anda memiliki izin penuh untuk melihat folder apa pun. Jika user bertanya 'gambar apa saja yang ada di folder x?', gunakan fungsi ini.",
      parameters: {
        type: "OBJECT",
        properties: {
          folder: {
            type: "STRING",
            description: "Nama folder di Cloudinary yang ingin dilihat isinya. Ini adalah parameter wajib."
          }
        },
        required: ["folder"]
      }
    }
  ]
};

// 2. Implementasi Fungsi Upload (tidak ada perubahan di sini)
async function uploadImageImplementation(base64Data, folder, public_id = null) {
    if (!base64Data) {
        return { success: false, error: "Gagal: Tidak ada data gambar yang diberikan untuk diunggah. Beritahu user bahwa mereka harus melampirkan gambar terlebih dahulu." };
    }
    try {
        const uploadOptions = {
            folder: folder || 'general_uploads', // Default folder jika tidak ada
            resource_type: "image"
        };
        if (public_id) {
            uploadOptions.public_id = public_id;
        }

        const result = await cloudinary.uploader.upload(`data:image/jpeg;base64,${base64Data}`, uploadOptions);
        
        console.log("Cloudinary Upload Success:", result.secure_url);
        return { success: true, url: result.secure_url, public_id: result.public_id };
    } catch (error) {
        console.error("Cloudinary Upload Error:", error);
        return { success: false, error: `Terjadi kesalahan saat mengunggah: ${error.message}` };
    }
}

// 3. Implementasi Fungsi List (tidak ada perubahan di sini)
async function listImagesImplementation(folder) {
    if (!folder) {
        return { success: false, error: "Gagal: Nama folder harus disebutkan untuk melihat isinya." };
    }
    try {
        const { resources } = await cloudinary.search
            .expression(`folder=${folder}`)
            .sort_by('public_id', 'desc')
            .max_results(10)
            .execute();

        const imageInfo = resources.map(file => ({ url: file.secure_url, public_id: file.public_id }));
        
        console.log(`Found ${imageInfo.length} images in folder ${folder}.`);
        if (imageInfo.length === 0) {
            return { success: true, message: `Tidak ada gambar yang ditemukan di dalam folder '${folder}'.` };
        }
        return { success: true, count: imageInfo.length, images: imageInfo };
    } catch (error) {
        console.error("Cloudinary List Error:", error);
        // **PERBAIKAN:** Berikan pesan error yang lebih spesifik jika folder tidak ada.
        if (error.message.includes('Folder not found')) {
             return { success: false, error: `Folder dengan nama '${folder}' tidak ditemukan di Cloudinary.` };
        }
        return { success: false, error: `Terjadi kesalahan saat mencari gambar: ${error.message}` };
    }
}

// 4. Ekspor semua yang dibutuhkan (tidak ada perubahan di sini)
module.exports = {
    cloudinaryTool,
    uploadImageImplementation,
    listImagesImplementation
};
