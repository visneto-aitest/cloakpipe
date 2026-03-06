//! CloakPipe CLI — entrypoint for the privacy proxy.

mod commands;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "cloakpipe")]
#[command(about = "Privacy middleware for LLM & RAG pipelines")]
#[command(version)]
struct Cli {
    /// Path to configuration file
    #[arg(short, long, default_value = "cloakpipe.toml")]
    config: String,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the CloakPipe proxy server
    Start,
    /// Test detection on sample text
    Test {
        /// Text to test detection on
        #[arg(short, long)]
        text: Option<String>,
        /// File to read test text from
        #[arg(short, long)]
        file: Option<String>,
    },
    /// Show vault statistics
    Stats,
    /// Initialize a new cloakpipe.toml config file
    Init,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "cloakpipe=info,tower_http=info".into()),
        )
        .init();

    match cli.command {
        Commands::Start => commands::start(&cli.config).await,
        Commands::Test { text, file } => commands::test(&cli.config, text, file).await,
        Commands::Stats => commands::stats(&cli.config).await,
        Commands::Init => commands::init().await,
    }
}
