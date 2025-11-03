mod argon2_hash;
mod bcrypt_hash;
mod md5_hash;
mod sha1_hash;

use rayon::prelude::*;
use std::time::Instant;

const TARGET_HASH: &str =
    "$argon2id$v=19$m=65536,t=3,p=2$c2FsdHNhbHQ$PUF5UxxoUY++mMekkQwFurL0ZsTtB7lelO23zcyZQ0c";
const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
// const CHARSET: &[u8] = b"0123456789";

fn hash_string(input: &str) -> bool {
    // sha1_hash::hash_sha1(input) == TARGET_HASH
    // md5_hash::hash_md5(input) == TARGET_HASH
    // bcrypt_hash::verify_bcrypt(input, TARGET_HASH)
    argon2_hash::verify_argon2(input, TARGET_HASH)
}

fn index_to_string(mut index: u64, length: usize) -> String {
    let mut result = vec![0u8; length];
    for i in (0..length).rev() {
        result[i] = CHARSET[(index % CHARSET.len() as u64) as usize];
        index /= CHARSET.len() as u64;
    }
    String::from_utf8(result).unwrap()
}

fn cpu_brute_force(target: &str, max_len: usize) -> Option<String> {
    println!("Target hash: {}", target);
    println!("Using {} threads\n", rayon::current_num_threads());

    let start = Instant::now();

    for length in 1..=max_len {
        let total_combinations = (CHARSET.len() as u64).pow(length as u32);
        println!(
            "Trying length {}: {} combinations",
            length, total_combinations
        );

        let batch_size = 10_000_000u64;
        let mut offset = 0u64;

        while offset < total_combinations {
            let current_batch = batch_size.min(total_combinations - offset);

            let result = (offset..offset + current_batch)
                .into_par_iter()
                .find_map_any(|idx| {
                    let candidate = index_to_string(idx, length);
                    let result = hash_string(&candidate);
                    if result { Some(candidate) } else { None }
                });

            if let Some(password) = result {
                let elapsed = start.elapsed();
                println!("\n✅ SUCCESS! Password found: {}", password);
                println!("Time elapsed: {:.2?}", elapsed);
                return Some(password);
            }

            offset += current_batch;

            if offset % (batch_size * 10) == 0 {
                println!(
                    "  Progress: {}/{} ({:.1}%) - {:.2?}",
                    offset,
                    total_combinations,
                    (offset as f64 / total_combinations as f64) * 100.0,
                    start.elapsed()
                );
            }
        }

        println!("  Length {} complete - {:.2?}", length, start.elapsed());
    }

    println!("\nPassword not found in search space");
    println!("Time elapsed: {:.2?}", start.elapsed());
    None
}

fn main() {
    rayon::ThreadPoolBuilder::new()
        .num_threads(16)
        .build_global()
        .unwrap();

    cpu_brute_force(TARGET_HASH, 6);
}
