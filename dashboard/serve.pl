use strict;
use IO::Socket::INET;
use File::Basename;
use POSIX qw();

my $port = $ARGV[0] || 3000;
my $root = dirname(__FILE__);

my %mime = (
  html => 'text/html',
  css  => 'text/css',
  js   => 'application/javascript',
  json => 'application/json',
  png  => 'image/png',
  ico  => 'image/x-icon',
);

my $server = IO::Socket::INET->new(
  LocalPort => $port,
  Type      => SOCK_STREAM,
  Reuse     => 1,
  Listen    => 10,
) or die "Cannot bind port $port: $!";

print "Serving $root on http://localhost:$port\n";
$| = 1;

while (my $client = $server->accept()) {
  my $req = '';
  while (my $line = <$client>) {
    $req .= $line;
    last if $line =~ /^\r?\n$/;
  }
  my ($method, $path) = $req =~ /^(\w+)\s+(\S+)/;
  $path = '/' unless defined $path;
  $path = '/index.html' if $path eq '/';
  $path =~ s/\?.*//;
  $path =~ s/\.\.//g;

  my $file = $root . $path;
  $file =~ s|/|\\|g if $^O eq 'MSWin32';

  if (-f $file) {
    my ($ext) = $file =~ /\.(\w+)$/;
    my $ct = $mime{lc($ext) || ''} || 'application/octet-stream';
    open my $fh, '<:raw', $file or do {
      print $client "HTTP/1.0 403 Forbidden\r\n\r\n";
      close $client; next;
    };
    local $/;
    my $body = <$fh>;
    close $fh;
    print $client "HTTP/1.0 200 OK\r\nContent-Type: $ct\r\nContent-Length: ".length($body)."\r\n\r\n".$body;
  } else {
    print $client "HTTP/1.0 404 Not Found\r\nContent-Type: text/plain\r\n\r\nNot found: $path";
  }
  close $client;
}
