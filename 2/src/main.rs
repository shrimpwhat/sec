use rayon::prelude::*;
use sha1::{Digest, Sha1};
use std::time::Instant;

const TARGET_HASH: &str = "7c4a8d09ca3762af61e59520943dc26494f8941b";
const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// Simple GPU compute shader that generates candidate indices in parallel
const SHADER: &str = r#"
@group(0) @binding(0)
var<storage, read_write> candidates: array<u32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    
    // Each GPU thread generates a unique candidate index
    // The CPU will convert this to actual string and hash it
    candidates[idx] = idx;
}
"#;

fn hash_string(input: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

fn index_to_string(mut index: u32, length: usize) -> String {
    let mut result = vec![0u8; length];
    for i in (0..length).rev() {
        result[i] = CHARSET[(index % CHARSET.len() as u32) as usize];
        index /= CHARSET.len() as u32;
    }
    String::from_utf8(result).unwrap()
}

async fn gpu_brute_force(target: &str, max_len: usize) -> Option<String> {
    println!("🚀 GPU-Accelerated Hash Brute Force (Educational Demo)");
    println!("Target hash: {}", target);
    println!("Using wgpu with Metal backend on Apple Silicon\n");

    // Setup GPU
    let instance = wgpu::Instance::default();
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions::default())
        .await?;

    println!("GPU Info:");
    println!("  Name: {}", adapter.get_info().name);
    println!("  Backend: {:?}", adapter.get_info().backend);
    println!("  Device Type: {:?}\n", adapter.get_info().device_type);

    let (device, queue) = adapter
        .request_device(&wgpu::DeviceDescriptor::default(), None)
        .await
        .ok()?;

    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("Compute Shader"),
        source: wgpu::ShaderSource::Wgsl(SHADER.into()),
    });

    let start = Instant::now();

    for length in 1..=max_len {
        let total_combinations = CHARSET.len().pow(length as u32) as u32;
        println!(
            "Trying length {}: {} combinations",
            length, total_combinations
        );

        let batch_size = 256 * 1024; // Process in batches
        let mut offset = 0u32;

        while offset < total_combinations {
            let current_batch = batch_size.min(total_combinations - offset);

            // Create buffer for GPU to write candidate indices
            let storage_buffer = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("Storage Buffer"),
                size: (current_batch * std::mem::size_of::<u32>() as u32) as u64,
                usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
                mapped_at_creation: false,
            });

            let bind_group_layout =
                device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                    label: Some("Bind Group Layout"),
                    entries: &[wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::COMPUTE,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Storage { read_only: false },
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    }],
                });

            let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Bind Group"),
                layout: &bind_group_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: storage_buffer.as_entire_binding(),
                }],
            });

            let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("Pipeline Layout"),
                bind_group_layouts: &[&bind_group_layout],
                push_constant_ranges: &[],
            });

            let compute_pipeline =
                device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                    label: Some("Compute Pipeline"),
                    layout: Some(&pipeline_layout),
                    module: &shader,
                    entry_point: "main",
                    compilation_options: Default::default(),
                    cache: None,
                });

            // Execute GPU work
            let mut encoder = device.create_command_encoder(&Default::default());
            {
                let mut cpass = encoder.begin_compute_pass(&Default::default());
                cpass.set_pipeline(&compute_pipeline);
                cpass.set_bind_group(0, &bind_group, &[]);
                cpass.dispatch_workgroups((current_batch + 255) / 256, 1, 1);
            }

            let staging_buffer = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("Staging Buffer"),
                size: (current_batch * std::mem::size_of::<u32>() as u32) as u64,
                usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });

            encoder.copy_buffer_to_buffer(
                &storage_buffer,
                0,
                &staging_buffer,
                0,
                (current_batch * std::mem::size_of::<u32>() as u32) as u64,
            );

            queue.submit(Some(encoder.finish()));

            // Read back results from GPU
            let buffer_slice = staging_buffer.slice(..);
            buffer_slice.map_async(wgpu::MapMode::Read, |_| {});
            device.poll(wgpu::Maintain::Wait);

            let data = buffer_slice.get_mapped_range();
            let indices: Vec<u32> = bytemuck::cast_slice(&data).to_vec();
            drop(data);
            staging_buffer.unmap();

            // CPU: Convert indices to strings and hash them in parallel
            let result = indices.par_iter().find_map_any(|&idx| {
                let candidate = index_to_string(offset + idx, length);
                let hash = hash_string(&candidate);
                if hash == target {
                    Some(candidate)
                } else {
                    None
                }
            });

            if let Some(password) = result {
                let elapsed = start.elapsed();
                println!("\n✅ SUCCESS! Password found: {}", password);
                println!("Time elapsed: {:.2?}", elapsed);

                let verify = hash_string(&password);
                println!("\nVerification:");
                println!("  Computed: {}", verify);
                println!("  Target:   {}", target);

                return Some(password);
            }

            offset += current_batch;
        }

        println!("  Length {} complete", length);
    }

    println!("\nPassword not found in search space");
    println!("Time elapsed: {:.2?}", start.elapsed());
    None
}

fn main() {
    pollster::block_on(gpu_brute_force(TARGET_HASH, 6));
}
